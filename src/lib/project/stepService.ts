import * as z from "zod";
import { CapabilityEnum } from "@/types/capabilities";
import { canEditProject, CANNOT_EDIT_PROJECT_MESSAGE, type ApprovalActor } from "@/lib/permissions";
import { findActiveApproval, type ApprovalDb } from "@/lib/commercial/approvalGuards";
import { APPROVAL_ERROR_COPY } from "@/lib/commercial/approvalCopy";
import { isProjectCompleteInDb } from "@/lib/project/projectGuards";
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

  // Idempotent: a second confirm keeps the first confirmation's time and author.
  const existing = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { scopeConfirmedAt: true },
  });
  if (existing.scopeConfirmedAt) {
    return {
      ok: true,
      data: { projectId, scopeConfirmedAt: existing.scopeConfirmedAt.toISOString() },
    };
  }
  const updated = await db.project.update({
    where: { id: projectId },
    data: { scopeConfirmedAt: new Date(), scopeConfirmedByUserId: actor!.id },
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
    data: { scopeConfirmedAt: null, scopeConfirmedByUserId: null },
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
