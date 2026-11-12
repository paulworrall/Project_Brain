"use server";

import { INITIAL_BRIEF_VERSION } from "@/lib/updateVersions";
import * as z from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { extractBriefText } from "@/services/parsing/brief";
import {
  IntakeAgentError,
  runIntakeAgent,
} from "@/services/agents/intake-agent";
import { saveCapturedKeyAttributes } from "@/lib/briefAttributeCapture";
import { normaliseBriefAssessment } from "@/types/intake";
import type { Prisma } from "@/generated/prisma/client";
import { recordKeyAttributeExtractionOutcome } from "@/lib/keyAttributeSources";
import { auth } from "@/lib/auth";
import { pmPerspectiveValuesFromFormData } from "@/lib/pmPerspective";
import { savePmPerspective } from "@/lib/pmPerspectiveStore";

const CreateProjectSchema = z.object({
  // FB-009 E: Client is required; the Workstream is chosen automatically
  // when the client has only one (older callers may still send it).
  clientId: z.string().trim().nullish(),
  workstreamId: z.string().trim().nullish(),
  // Optional: the Intake Agent suggests one from the brief when blank.
  name: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || v.length >= 2, { error: "Project name must be at least 2 characters." }),
  // Optional: defaults to the current user when they can be a PM.
  projectManagerId: z.string().trim().nullish(),
  // .nullish(), not .optional() — in upload mode the textarea isn't rendered,
  // so formData.get("briefText") is null, and .optional() rejects null with
  // zod's raw "Invalid input: expected string, received null" (FB-002).
  briefText: z.string().trim().nullish(),
  // .nullish(), not .optional() — a disabled <select> (no Rate Card options
  // yet) is omitted from FormData entirely on submit, so formData.get()
  // returns null here, not undefined.
  rateCardId: z.string().trim().nullish(),
  // Only meaningful when rateCardId is set (validated below, not here — Zod
  // can't easily express "required iff sibling field is set" inline).
  rateCardVersionId: z.string().trim().nullish(),
  // FB-009 E: optional. Defaults to the client's current MSA; a client with
  // none can still have a project (the Brief readiness check shows it missing).
  // When sent, it must still be this client's active MSA.
  masterServiceAgreementId: z.string().trim().nullish(),
});

export interface RateCardVersionOption {
  id: string;
  versionNumber: number;
  fileName: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  // "Flagged as default for display" (see uploadRateCardVersionAction) — the
  // form pre-selects whichever version has this, but every version stays
  // pickable regardless.
  status: "ENABLED" | "DISABLED";
  // Distinct currencies of this version's rate lines, sorted (e.g. ["EUR", "GBP"]);
  // empty for older versions that have no recorded lines.
  currencies: string[];
}

export interface RateCardOption {
  id: string;
  name: string;
  // Nullable — a rate card can carry several currencies (one per role)
  // within a single file, so it's not always set at upload time.
  currency: string | null;
  // Every version of this Rate Card, newest first — Rule 3 (audit gap): rate
  // cards don't supersede, so every version stays independently selectable
  // forever, not just whichever one is flagged ENABLED. Grouped per rate
  // card so a caller can present "Rate Card X: v1, v2, v3."
  versions: RateCardVersionOption[];
}

/**
 * Client-scoped Rate Card lookup for the "New Project" form's dropdown —
 * the actual isolation boundary (CLAUDE.md's project_id-filter pattern,
 * applied here to clientId): resolves the Workstream's own Client first,
 * then queries only that Client's Rate Cards. A different Client's Rate
 * Cards are never fetched, not just hidden from the rendered options.
 * Excludes archived Rate Cards (archiveRateCardAction) by default; existence
 * is "has at least one version at all," not "has an ENABLED one" — status is
 * no longer a selectability gate for this table (see
 * uploadRateCardVersionAction in clients/[clientId]/actions.ts).
 */
export async function getRateCardsForWorkstreamAction(
  workstreamId: string
): Promise<RateCardOption[]> {
  if (!workstreamId) {
    return [];
  }

  const workstream = await prisma.workstream.findUnique({
    where: { id: workstreamId },
    select: { clientId: true },
  });
  if (!workstream) {
    return [];
  }
  return rateCardOptionsForClient(workstream.clientId);
}

/** A client's selectable rate cards (not archived, at least one version), with every version. */
async function rateCardOptionsForClient(clientId: string): Promise<RateCardOption[]> {
  const rateCards = await prisma.rateCard.findMany({
    where: { clientId, archivedAt: null, versions: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      currency: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          effectiveFrom: true,
          effectiveTo: true,
          status: true,
          lineItems: { select: { currency: true }, distinct: ["currency"] },
        },
      },
    },
  });

  return rateCards.map((rateCard) => ({
    ...rateCard,
    versions: rateCard.versions.map(({ lineItems, ...version }) => ({
      ...version,
      currencies: lineItems.map((line) => line.currency).sort(),
    })),
  }));
}

export interface MasterServiceAgreementOption {
  id: string;
  fileName: string;
  effectiveFrom: Date;
}

/**
 * Client-scoped MSA lookup for the "New Project" form's required MSA
 * select — resolves the Workstream's own Client first, same isolation
 * pattern as getRateCardsForWorkstreamAction. Returns the Client's MSA only
 * if it currently has an ENABLED version (MSA exclusivity is unchanged —
 * there is never more than one), otherwise null so the form can tell the
 * user clearly that no active MSA exists rather than showing an empty
 * required select with no explanation.
 */
export async function getMasterServiceAgreementForWorkstreamAction(
  workstreamId: string
): Promise<MasterServiceAgreementOption | null> {
  if (!workstreamId) {
    return null;
  }

  const workstream = await prisma.workstream.findUnique({
    where: { id: workstreamId },
    select: { clientId: true },
  });
  if (!workstream) {
    return null;
  }

  const msa = await prisma.masterServiceAgreement.findUnique({
    where: { clientId: workstream.clientId },
    select: {
      id: true,
      versions: {
        where: { status: "ENABLED" },
        select: { fileName: true, effectiveFrom: true },
        take: 1,
      },
    },
  });
  const currentVersion = msa?.versions[0];
  if (!msa || !currentVersion) {
    return null;
  }

  return { id: msa.id, fileName: currentVersion.fileName, effectiveFrom: currentVersion.effectiveFrom };
}

/** The client's current MSA (one ENABLED version), or null. */
async function currentMsaForClient(clientId: string): Promise<MasterServiceAgreementOption | null> {
  const msa = await prisma.masterServiceAgreement.findUnique({
    where: { clientId },
    select: {
      id: true,
      versions: {
        where: { status: "ENABLED" },
        select: { fileName: true, effectiveFrom: true },
        take: 1,
      },
    },
  });
  const current = msa?.versions[0];
  return msa && current ? { id: msa.id, fileName: current.fileName, effectiveFrom: current.effectiveFrom } : null;
}

export interface ClientProjectDefaults {
  workstreams: { id: string; name: string }[];
  msa: MasterServiceAgreementOption | null;
  rateCards: RateCardOption[];
  /** The default per the business rules: the client's only rate card and its current version. */
  defaultRateCard: { rateCardId: string; rateCardVersionId: string } | null;
}

/**
 * FB-009 E: what the New Project form shows once a Client is picked — its
 * workstreams, its current MSA and its rate cards, with the defaults ("Using:
 * <MSA>, <rate card>"). Client-scoped: another client's documents are never
 * fetched.
 */
export async function getClientProjectDefaultsAction(clientId: string): Promise<ClientProjectDefaults> {
  if (!clientId) return { workstreams: [], msa: null, rateCards: [], defaultRateCard: null };
  const [workstreams, msa, rateCards] = await Promise.all([
    prisma.workstream.findMany({ where: { clientId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    currentMsaForClient(clientId),
    rateCardOptionsForClient(clientId),
  ]);
  const only = rateCards.length === 1 ? rateCards[0] : null;
  const version = only ? (only.versions.find((v) => v.status === "ENABLED") ?? only.versions[0]) : null;
  return {
    workstreams,
    msa,
    rateCards,
    defaultRateCard: only && version ? { rateCardId: only.id, rateCardVersionId: version.id } : null,
  };
}

/** A name not yet used in the workstream: "Name", then "Name (2)", "Name (3)"… */
async function uniqueProjectName(workstreamId: string, base: string): Promise<string> {
  const trimmed = base.trim().slice(0, 80) || "New project";
  const taken = new Set(
    (
      await prisma.project.findMany({
        where: { workstreamId, name: { startsWith: trimmed } },
        select: { name: true },
      })
    ).map((p) => p.name)
  );
  if (!taken.has(trimmed)) return trimmed;
  for (let i = 2; ; i++) {
    const candidate = `${trimmed} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
}

export type CreateProjectState =
  | {
      errors?: {
        clientId?: string[];
        workstreamId?: string[];
        projectManagerId?: string[];
        name?: string[];
        briefText?: string[];
        briefFile?: string[];
        masterServiceAgreementId?: string[];
      };
      message?: string;
    }
  | undefined;

export type BriefFilePreviewResult =
  | { ok: true; fileName: string; charCount: number; preview: string }
  | { ok: false; error: string };

/**
 * Reads an uploaded Brief file exactly as createProjectAction will, so the
 * form can show errors and a text preview at selection time. Saves nothing.
 */
export async function previewBriefFileAction(formData: FormData): Promise<BriefFilePreviewResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }
  const file = formData.get("briefFile");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a file to upload." };
  }
  const extracted = await extractBriefText(
    { name: file.name, size: file.size, type: file.type },
    Buffer.from(await file.arrayBuffer())
  );
  if (!extracted.ok) return { ok: false, error: extracted.error };
  return {
    ok: true,
    fileName: file.name,
    charCount: extracted.text.length,
    preview: extracted.text.slice(0, 280),
  };
}

export async function createProjectAction(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const parsed = CreateProjectSchema.safeParse({
    clientId: formData.get("clientId"),
    workstreamId: formData.get("workstreamId"),
    name: formData.get("name"),
    projectManagerId: formData.get("projectManagerId"),
    briefText: formData.get("briefText"),
    rateCardId: formData.get("rateCardId"),
    rateCardVersionId: formData.get("rateCardVersionId"),
    masterServiceAgreementId: formData.get("masterServiceAgreementId"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // FB-009 E: resolve the Client and Workstream. A client with one workstream
  // needs no choice; with several, the form asks. (Projects belong to a
  // Workstream, so one is always needed.)
  let workstreamId = parsed.data.workstreamId ?? null;
  if (!workstreamId) {
    if (!parsed.data.clientId) {
      return { errors: { clientId: ["Select a client."] } };
    }
    const workstreams = await prisma.workstream.findMany({
      where: { clientId: parsed.data.clientId },
      select: { id: true },
    });
    if (workstreams.length === 0) {
      return { message: "This client has no workstream yet. Ask an Admin to add one." };
    }
    if (workstreams.length > 1) {
      return { errors: { workstreamId: ["Select a workstream."] } };
    }
    workstreamId = workstreams[0].id;
  }
  // Resolved once, reused by the MSA and Rate Card checks below.
  const workstream = await prisma.workstream.findUnique({
    where: { id: workstreamId },
    select: { clientId: true },
  });
  if (!workstream || (parsed.data.clientId && workstream.clientId !== parsed.data.clientId)) {
    return { message: "Selected workstream is not valid." };
  }

  // MSA: never trust a submitted id belongs to the right Client without
  // checking ("currently active" = has an ENABLED version). FB-009 E: when
  // none is sent, the client's current MSA is used; a client with none can
  // still have a project.
  let msaId: string | null = null;
  if (parsed.data.masterServiceAgreementId) {
    const validMsa = await prisma.masterServiceAgreement.findFirst({
      where: {
        id: parsed.data.masterServiceAgreementId,
        clientId: workstream.clientId,
        versions: { some: { status: "ENABLED" } },
      },
      select: { id: true },
    });
    if (!validMsa) {
      return { message: "Select a valid, active Master Service Agreement for this client." };
    }
    msaId = validMsa.id;
  } else {
    msaId = (await currentMsaForClient(workstream.clientId))?.id ?? null;
  }

  // PM: optional; defaults to the current user when they can be a PM.
  const session = await auth();
  let projectManagerId: string | null = null;
  const requestedPm = parsed.data.projectManagerId ?? (session?.user?.role === "DELIVERY" ? session.user.id : null);
  if (requestedPm) {
    const pm = await prisma.user.findFirst({ where: { id: requestedPm, role: "DELIVERY" }, select: { id: true } });
    if (!pm && parsed.data.projectManagerId) {
      return { errors: { projectManagerId: ["Choose a project manager from the list."] } };
    }
    projectManagerId = pm?.id ?? null;
  }

  // Re-validate server-side even though the dropdown was already scoped —
  // never trust a submitted id belongs to the right Client without checking.
  // Existence is "has at least one version at all," not "has an ENABLED
  // one" — status is no longer a selectability gate for Rate Cards (see
  // getRateCardsForWorkstreamAction above); archived Rate Cards are also
  // rejected here, matching the dropdown. When a Rate Card is selected, a
  // specific Version must be too — pinned on the Project so a later upload
  // (which never supersedes) can't silently change which figures apply
  // (Rule 3 audit gap).
  let rateCardId: string | null = null;
  let rateCardVersionId: string | null = null;
  if (parsed.data.rateCardId) {
    const validRateCard = await prisma.rateCard.findFirst({
      where: {
        id: parsed.data.rateCardId,
        clientId: workstream.clientId,
        archivedAt: null,
        versions: { some: {} },
      },
      select: { id: true },
    });
    if (!validRateCard) {
      return { message: "Selected rate card is not valid for this client." };
    }
    rateCardId = validRateCard.id;

    const validRateCardVersion = parsed.data.rateCardVersionId
      ? await prisma.rateCardVersion.findFirst({
          where: { id: parsed.data.rateCardVersionId, rateCardId },
          select: { id: true },
        })
      : null;
    if (!validRateCardVersion) {
      return { message: "Select a version of the chosen rate card." };
    }
    rateCardVersionId = validRateCardVersion.id;
  }

  const briefFile = formData.get("briefFile");
  const hasFile = briefFile instanceof File && briefFile.size > 0;
  const hasPastedText = !!parsed.data.briefText;

  if (!hasFile && !hasPastedText) {
    return { message: "Paste the brief text or upload a file." };
  }
  if (hasFile && hasPastedText) {
    return { message: "Provide either pasted text or a file, not both." };
  }

  let briefRawText: string;
  let briefFileName: string | null = null;
  let briefFileType: string | null = null;

  if (hasFile && briefFile instanceof File) {
    briefFileName = briefFile.name;
    briefFileType = briefFile.type || null;
    const extracted = await extractBriefText(
      { name: briefFile.name, size: briefFile.size, type: briefFile.type },
      Buffer.from(await briefFile.arrayBuffer())
    );
    if (!extracted.ok) {
      return { errors: { briefFile: [extracted.error] } };
    }
    briefRawText = extracted.text;
  } else {
    briefRawText = parsed.data.briefText!;
  }

  if (briefRawText.trim().length === 0) {
    return { message: "The brief appears to be empty." };
  }

  const pmPerspective = pmPerspectiveValuesFromFormData(formData);

  let intakeResult;
  try {
    // Intake also reads the key details (the one record for budget,
    // objective, timeline, contact…) and keeps them out of the Position
    // Document. The PM perspective is optional and never blocks intake; it
    // goes to the agents as its own labelled block and is stored on its own
    // — never merged into briefRawText, and never used for key details
    // (they must come from the client).
    intakeResult = await runIntakeAgent(briefRawText, pmPerspective);
  } catch (error) {
    if (error instanceof IntakeAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  // FB-009 E: a blank name takes the Intake Agent's suggestion, kept unique
  // within the workstream.
  const name = parsed.data.name
    ? parsed.data.name
    : await uniqueProjectName(
        workstreamId,
        intakeResult.classification.suggestedProjectName?.trim() || `New project ${new Date().toISOString().slice(0, 10)}`
      );

  const project = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name,
        workstreamId,
        projectManagerId,
        briefRawText,
        briefFileName,
        briefFileType,
        currentStageNumber: 3,
        rateCardId,
        rateCardVersionId,
        masterServiceAgreementId: msaId,
        // FB-009 D: the Intake Agent's judgement of the brief (null if it gave none).
        briefAssessment: (normaliseBriefAssessment(intakeResult.classification.assessment) ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // Stage 2 (Clarification Email Sent) completes immediately alongside
    // Intake — the email is generated as part of this same Intake Agent run,
    // not a separate pipeline step with its own status (Phase 1 rework).
    // Stage 3 (Get Clarifications) opens straight away as the fluid,
    // repeatable client-update workspace.
    const [intakeStage, clarificationEmailStage, getClarificationsStage] = await Promise.all([
      tx.stage.findUniqueOrThrow({ where: { number: 1 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 2 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 3 } }),
    ]);

    await tx.projectStageStatus.create({
      data: {
        projectId: project.id,
        stageId: intakeStage.id,
        status: "COMPLETE",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await tx.projectStageStatus.create({
      data: {
        projectId: project.id,
        stageId: clarificationEmailStage.id,
        status: "COMPLETE",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await tx.projectStageStatus.create({
      data: {
        projectId: project.id,
        stageId: getClarificationsStage.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    await tx.document.create({
      data: {
        projectId: project.id,
        type: "CLARIFICATION_EMAIL",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: intakeResult.clarificationEmail,
            builtFromVersion: INITIAL_BRIEF_VERSION,
          },
        },
      },
    });
    await tx.document.create({
      data: {
        projectId: project.id,
        type: "SCOPE_SUMMARY",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: intakeResult.scopeSummary,
            builtFromVersion: INITIAL_BRIEF_VERSION,
          },
        },
      },
    });
    await tx.document.create({
      data: {
        projectId: project.id,
        type: "CHECKLIST",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            // The stored document keeps its original shape (labels only).
            content: { items: intakeResult.checklist.items.map((item) => item.label) },
          },
        },
      },
    });

    await tx.checklistItem.createMany({
      data: intakeResult.checklist.items.map((item, index) => ({
        projectId: project.id,
        label: item.label,
        step: item.step,
        order: index,
      })),
    });

    return project;
  });

  // Key details read from the brief are captured straight away — no
  // approval step. A failed read never blocks creating the project; it's
  // recorded so the PM sees it and can re-run "Re-read brief & inputs".
  await recordKeyAttributeExtractionOutcome(project.id, intakeResult.keyAttributesError);
  if (intakeResult.keyAttributes) {
    await saveCapturedKeyAttributes(project.id, [
      { extraction: intakeResult.keyAttributes, source: "BRIEF" },
    ]);
  }

  await savePmPerspective(project.id, pmPerspective, session?.user?.id ?? null);

  redirect(`/projects/${project.id}`);
}
