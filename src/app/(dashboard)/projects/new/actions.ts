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
});

export interface RateCardOption {
  id: string;
  name: string;
  currency: string;
}

/**
 * Client-scoped Rate Card lookup for the "New Project" form's dropdown —
 * the actual isolation boundary (CLAUDE.md's project_id-filter pattern,
 * applied here to clientId): resolves the Workstream's own Client first,
 * then queries only that Client's Rate Cards. A different Client's Rate
 * Cards are never fetched, not just hidden from the rendered options.
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
    where: { clientId: workstream.clientId, versions: { some: { status: "ENABLED" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, currency: true },
  });
}

export type CreateProjectState =
  | {
      errors?: {
        workstreamId?: string[];
        name?: string[];
        briefText?: string[];
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
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // Re-validate server-side even though the dropdown was already scoped —
  // never trust a submitted id belongs to the right Client without checking.
  let rateCardId: string | null = null;
  if (parsed.data.rateCardId) {
    const workstream = await prisma.workstream.findUnique({
      where: { id: parsed.data.workstreamId },
      select: { clientId: true },
    });
    const validRateCard = workstream
      ? await prisma.rateCard.findFirst({
          where: {
            id: parsed.data.rateCardId,
            clientId: workstream.clientId,
            versions: { some: { status: "ENABLED" } },
          },
          select: { id: true },
        })
      : null;
    if (!validRateCard) {
      return { message: "Selected rate card is not valid for this client." };
    }
    rateCardId = validRateCard.id;
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
