"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";
import {
  IntakeAgentError,
  generateSetupChecklist,
  runIntakeAgent,
} from "@/services/agents/intake-agent";
import type { Prisma } from "@/generated/prisma/client";

const CreateProjectSchema = z.object({
  workstreamId: z.string().min(1, { error: "Select a workstream." }),
  name: z.string().trim().min(2, { error: "Project name must be at least 2 characters." }),
  briefText: z.string().trim().optional(),
  // .nullish(), not .optional() — a disabled <select> (no Rate Card options
  // yet) is omitted from FormData entirely on submit, so formData.get()
  // returns null here, not undefined.
  rateCardId: z.string().trim().nullish(),
  // Only meaningful when rateCardId is set (validated below, not here — Zod
  // can't easily express "required iff sibling field is set" inline).
  rateCardVersionId: z.string().trim().nullish(),
  // Required (audit Rule 1 gap fix) — plain .min(1), not .nullish(): every
  // project must be created under a specific, currently-active client MSA.
  // No UI sends this field yet (phase 3 adds the selector); until then this
  // action rejects every submission with a clear "Select..." error rather
  // than silently defaulting or skipping the check.
  masterServiceAgreementId: z
    .string({ error: "Select the client's Master Service Agreement." })
    .trim()
    .min(1, { error: "Select the client's Master Service Agreement." }),
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

  return prisma.rateCard.findMany({
    where: { clientId: workstream.clientId, archivedAt: null, versions: { some: {} } },
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
        },
      },
    },
  });
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

export type CreateProjectState =
  | {
      errors?: {
        workstreamId?: string[];
        name?: string[];
        briefText?: string[];
        masterServiceAgreementId?: string[];
      };
      message?: string;
    }
  | undefined;

export async function createProjectAction(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const parsed = CreateProjectSchema.safeParse({
    workstreamId: formData.get("workstreamId"),
    name: formData.get("name"),
    briefText: formData.get("briefText"),
    rateCardId: formData.get("rateCardId"),
    rateCardVersionId: formData.get("rateCardVersionId"),
    masterServiceAgreementId: formData.get("masterServiceAgreementId"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // Resolved once, reused by both the MSA and Rate Card checks below.
  const workstream = await prisma.workstream.findUnique({
    where: { id: parsed.data.workstreamId },
    select: { clientId: true },
  });
  if (!workstream) {
    return { message: "Selected workstream is not valid." };
  }

  // Re-validate server-side even though the (future) selector will already
  // be scoped — never trust a submitted id belongs to the right Client
  // without checking. Rejects outright (no silent default/skip) if missing
  // or invalid, per Rule 1 (audit gap): every project must be created under
  // a specific, currently-active MSA. "Currently-active" mirrors MSA's own
  // exclusivity semantics (unchanged elsewhere) — has an ENABLED version.
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
    try {
      const buffer = Buffer.from(await briefFile.arrayBuffer());
      briefRawText = await parseDocumentToText(buffer, briefFile.name);
    } catch (error) {
      if (error instanceof UnsupportedBriefFormatError) {
        return { message: error.message };
      }
      return { message: "Couldn't read that file. Try pasting the brief text instead." };
    }
  } else {
    briefRawText = parsed.data.briefText!;
  }

  if (briefRawText.trim().length === 0) {
    return { message: "The brief appears to be empty." };
  }

  let intakeResult;
  try {
    intakeResult = await runIntakeAgent(briefRawText);
  } catch (error) {
    if (error instanceof IntakeAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  const project = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: parsed.data.name,
        workstreamId: parsed.data.workstreamId,
        briefRawText,
        briefFileName,
        briefFileType,
        currentStageNumber: 3,
        rateCardId,
        rateCardVersionId,
        masterServiceAgreementId: validMsa.id,
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
          },
        },
      },
    });
    await tx.document.create({
      data: {
        projectId: project.id,
        type: "POSITION_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: intakeResult.positionDocument,
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
            content: generateSetupChecklist() as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });

    await tx.checklistItem.createMany({
      data: intakeResult.checklist.items.map((label, index) => ({
        projectId: project.id,
        label,
        order: index,
      })),
    });

    return project;
  });

  redirect(`/projects/${project.id}`);
}
