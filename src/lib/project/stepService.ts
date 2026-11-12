import * as z from "zod";
import { CapabilityEnum } from "@/types/capabilities";
import { canEditProject, CANNOT_EDIT_PROJECT_MESSAGE, type ApprovalActor } from "@/lib/permissions";
import { findActiveApproval, type ApprovalDb } from "@/lib/commercial/approvalGuards";
import { APPROVAL_ERROR_COPY } from "@/lib/commercial/approvalCopy";
import { isProjectCompleteInDb } from "@/lib/project/projectGuards";
import { appendScopeSummaryVersion, latestScopeSummary } from "@/lib/scopeSummary";
import { ScopeSummaryContentSchema, changedScopeSections, normaliseScopeSummary } from "@/types/scope";
import type { ActionResult, ApprovalErrorCode } from "@/types/approvals";

/**
 * FB-008 step rules (scope gate, specialist rows, checklist steps), free of
 * Next/auth so they can be tested against the database directly. The server
 * actions in step-actions.ts are thin wrappers (session -> actor,
 * revalidatePath), following FB-005's approvalService.
 */

function fail(code: ApprovalErrorCode, message: string = APPROVAL_ERROR_COPY[code]) {
  return { ok: false as const, code, message };
}

function validationFailure(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return {
    ok: false as const,
    code: "VALIDATION" as const,
    message: APPROVAL_ERROR_COPY.VALIDATION,
    fieldErrors,
  };
}

/** Permission, existence and the project-complete lock — shared by every mutation here. */
async function precheck(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  projectId: string
): Promise<ReturnType<typeof fail> | null> {
  if (!canEditProject(actor)) return fail("FORBIDDEN", CANNOT_EDIT_PROJECT_MESSAGE);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail("NOT_FOUND", "Project not found.");
  if (await isProjectCompleteInDb(projectId, db)) return fail("PROJECT_COMPLETE");
  return null;
}

const ProjectIdSchema = z.object({ projectId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Scope gate
// ---------------------------------------------------------------------------

export interface ScopeResultData {
  projectId: string;
  scopeConfirmedAt: string | null;
}

export async function confirmScope(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ScopeResultData>> {
  const parsed = ProjectIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;

  // FB-009: confirming records the Scope summary version confirmed (the
  // latest; null for a legacy project with none). Confirming again when a
  // newer version exists moves the confirmation to it — that's how a scope
  // change reaches the estimate ("Scope changed since this estimate").
  // Otherwise idempotent: the first confirmation's time and author are kept.
  const [existing, latest] = await Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { scopeConfirmedAt: true, confirmedScopeVersionId: true },
    }),
    latestScopeSummary(projectId, db),
  ]);
  const latestId = latest?.id ?? null;
  if (existing.scopeConfirmedAt && existing.confirmedScopeVersionId === latestId) {
    return {
      ok: true,
      data: { projectId, scopeConfirmedAt: existing.scopeConfirmedAt.toISOString() },
    };
  }
  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      scopeConfirmedAt: new Date(),
      scopeConfirmedByUserId: actor!.id,
      confirmedScopeVersionId: latestId,
    },
    select: { scopeConfirmedAt: true },
  });
  return {
    ok: true,
    data: { projectId, scopeConfirmedAt: updated.scopeConfirmedAt!.toISOString() },
  };
}

export async function reopenScope(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ScopeResultData>> {
  const parsed = ProjectIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;
  if (await findActiveApproval(db, projectId, "ESTIMATE")) return fail("ESTIMATE_APPROVED");

  await db.project.update({
    where: { id: projectId },
    data: { scopeConfirmedAt: null, scopeConfirmedByUserId: null, confirmedScopeVersionId: null },
  });
  return { ok: true, data: { projectId, scopeConfirmedAt: null } };
}

// ---------------------------------------------------------------------------
// Specialist input tracker
// ---------------------------------------------------------------------------

export const SpecialistInputSchema = z.object({
  projectId: z.string().min(1),
  capability: CapabilityEnum,
  status: z.enum(["not_requested", "requested", "received"]),
  note: z
    .string()
    .trim()
    .max(1000, { error: "Keep the note under 1,000 characters." })
    .optional()
    .transform((v) => (v ? v : null)),
});

export interface SpecialistInputResultData {
  projectId: string;
  capability: string;
  status: "not_requested" | "requested" | "received";
  note: string | null;
}

export async function updateSpecialistInput(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<SpecialistInputResultData>> {
  const parsed = SpecialistInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId, capability, status, note } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;

  // Rows follow the confirmed capability list — no rows for anything else.
  const confirmed = await db.projectCapability.findUnique({
    where: { projectId_capability: { projectId, capability } },
    select: { id: true },
  });
  if (!confirmed) return fail("VALIDATION", "That capability isn't confirmed for this project.");

  const row = await db.specialistInput.upsert({
    where: { projectId_capability: { projectId, capability } },
    update: { status, note, updatedByUserId: actor!.id },
    create: { projectId, capability, status, note, updatedByUserId: actor!.id },
  });
  return {
    ok: true,
    data: { projectId, capability: row.capability, status: row.status, note: row.note },
  };
}

// ---------------------------------------------------------------------------
// Checklist items: step assignment and adding
// ---------------------------------------------------------------------------

const StepEnum = z.enum(["brief", "estimate", "sow"]);

export const ChecklistItemStepSchema = z.object({
  projectId: z.string().min(1),
  itemId: z.string().min(1),
  step: StepEnum,
});

export interface ChecklistItemResultData {
  projectId: string;
  itemId: string;
  step: "brief" | "estimate" | "sow";
}

export async function setChecklistItemStep(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ChecklistItemResultData>> {
  const parsed = ChecklistItemStepSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId, itemId, step } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;

  const result = await db.checklistItem.updateMany({
    where: { id: itemId, projectId },
    data: { step },
  });
  if (result.count === 0) return fail("NOT_FOUND", "Checklist item not found.");
  return { ok: true, data: { projectId, itemId, step } };
}

export const AddChecklistItemSchema = z.object({
  projectId: z.string().min(1),
  label: z
    .string()
    .trim()
    .min(1, { error: "Name the item before adding it." })
    .max(200, { error: "Keep the item under 200 characters." }),
  step: StepEnum,
});

export async function addChecklistItem(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ChecklistItemResultData>> {
  const parsed = AddChecklistItemSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId, label, step } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;

  const last = await db.checklistItem.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const item = await db.checklistItem.create({
    data: { projectId, label, step, order: (last?.order ?? -1) + 1 },
  });
  return { ok: true, data: { projectId, itemId: item.id, step } };
}

// ---------------------------------------------------------------------------
// FB-009: Scope summary edits and the clarification email's sent flag
// ---------------------------------------------------------------------------

export const EditScopeSummarySchema = z.object({
  projectId: z.string().min(1),
  /** The version the PM edited — refused if a newer one has arrived since. */
  baseVersionId: z.string().min(1),
  content: ScopeSummaryContentSchema,
});

export interface ScopeSummaryResultData {
  projectId: string;
  versionNumber: number;
  changedSections: string[];
}

export async function editScopeSummary(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ScopeSummaryResultData>> {
  const parsed = EditScopeSummarySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId, baseVersionId } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;

  const latest = await latestScopeSummary(projectId, db);
  if (!latest) return fail("NOT_FOUND", "This project has no scope summary yet.");
  if (latest.id !== baseVersionId) {
    return fail(
      "VALIDATION",
      `The scope summary changed while you were editing (now v${latest.versionNumber}). Copy your changes, refresh and try again.`
    );
  }
  const content = normaliseScopeSummary(parsed.data.content);
  const changedSections = changedScopeSections(latest.content, content);
  if (changedSections.length === 0) {
    return { ok: true, data: { projectId, versionNumber: latest.versionNumber, changedSections } };
  }
  const saved = await appendScopeSummaryVersion(projectId, content, { userId: actor!.id }, db);
  return { ok: true, data: { projectId, versionNumber: saved.versionNumber, changedSections } };
}

export const ClarificationSentSchema = z.object({
  projectId: z.string().min(1),
  sent: z.boolean(),
});

export interface ClarificationSentResultData {
  projectId: string;
  clarificationSentAt: string | null;
}

/** "Mark as sent" (or undo it). The app never sends anything itself. */
export async function setClarificationSent(
  db: ApprovalDb,
  actor: ApprovalActor | null | undefined,
  input: unknown
): Promise<ActionResult<ClarificationSentResultData>> {
  const parsed = ClarificationSentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { projectId, sent } = parsed.data;
  const blocked = await precheck(db, actor, projectId);
  if (blocked) return blocked;
  const updated = await db.project.update({
    where: { id: projectId },
    data: { clarificationSentAt: sent ? new Date() : null },
    select: { clarificationSentAt: true },
  });
  return {
    ok: true,
    data: { projectId, clarificationSentAt: updated.clarificationSentAt?.toISOString() ?? null },
  };
}
