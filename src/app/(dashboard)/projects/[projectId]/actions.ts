"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ClarificationExtractionError,
  extractClarificationUpdate,
} from "@/services/agents/clarification-extraction";
import { TriageAgentError, generateDraftScopeDocument } from "@/services/agents/triage-agent";
import {
  SpecialistReviewExtractionError,
  extractDeliverablesAndServices,
} from "@/services/agents/specialist-review-extraction";
import { PositionDocumentFieldsSchema } from "@/types/intake";
import { DraftScopeDocumentSchema } from "@/types/triage";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";

export interface ActionState {
  message?: string;
}

const ProjectSummarySchema = z.object({
  jobCode: z.string().trim().optional(),
  kickOffDate: z.string().trim().optional(),
  targetCompletionDate: z.string().trim().optional(),
  projectManagerId: z.string().trim().optional(),
});

function emptyToNull(value: string | undefined): string | null {
  return value ? value : null;
}

export async function updateProjectSummaryAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = ProjectSummarySchema.safeParse({
    jobCode: formData.get("jobCode"),
    kickOffDate: formData.get("kickOffDate"),
    targetCompletionDate: formData.get("targetCompletionDate"),
    projectManagerId: formData.get("projectManagerId"),
  });
  if (!parsed.success) {
    return { message: "Invalid project details." };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      jobCode: emptyToNull(parsed.data.jobCode),
      kickOffDate: parsed.data.kickOffDate ? new Date(parsed.data.kickOffDate) : null,
      targetCompletionDate: parsed.data.targetCompletionDate
        ? new Date(parsed.data.targetCompletionDate)
        : null,
      projectManagerId: emptyToNull(parsed.data.projectManagerId),
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

const NotesSchema = z.object({
  notes: z.string().trim().min(1, { error: "Paste the client's reply before submitting." }),
});

export async function submitClarificationNotesAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = NotesSchema.safeParse({ notes: formData.get("notes") });
  if (!parsed.success) {
    return { message: z.flattenError(parsed.error).fieldErrors.notes?.[0] ?? "Invalid notes." };
  }

  const session = await auth();

  const positionDocument = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const latestVersion = positionDocument?.versions[0];
  const currentFields = PositionDocumentFieldsSchema.safeParse(latestVersion?.content);

  if (!positionDocument || !latestVersion || !currentFields.success) {
    return { message: "No Position Document found to update." };
  }

  let updatedFields;
  try {
    updatedFields = await extractClarificationUpdate(currentFields.data, parsed.data.notes);
  } catch (error) {
    if (error instanceof ClarificationExtractionError) {
      return { message: error.message };
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.touchpointNote.create({
      data: {
        projectId,
        type: "CLARIFICATION_REPLY",
        content: parsed.data.notes,
        createdById: session?.user?.id,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: positionDocument.id,
        versionNumber: latestVersion.versionNumber + 1,
        stageNumber: 3,
        content: updatedFields,
        createdById: session?.user?.id,
      },
    });

    const [clarificationEmailStage, getClarificationsStage, triageStage] = await Promise.all([
      tx.stage.findUniqueOrThrow({ where: { number: 2 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 3 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 4 } }),
    ]);

    await tx.projectStageStatus.upsert({
      where: { projectId_stageId: { projectId, stageId: clarificationEmailStage.id } },
      update: { status: "COMPLETE", completedAt: new Date() },
      create: {
        projectId,
        stageId: clarificationEmailStage.id,
        status: "COMPLETE",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await tx.projectStageStatus.upsert({
      where: { projectId_stageId: { projectId, stageId: getClarificationsStage.id } },
      update: { status: "COMPLETE", completedAt: new Date() },
      create: {
        projectId,
        stageId: getClarificationsStage.id,
        status: "COMPLETE",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await tx.projectStageStatus.upsert({
      where: { projectId_stageId: { projectId, stageId: triageStage.id } },
      update: { status: "IN_PROGRESS" },
      create: {
        projectId,
        stageId: triageStage.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    await tx.project.update({ where: { id: projectId }, data: { currentStageNumber: 4 } });
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function runTriageAgentAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();

  const positionDocument = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const currentFields = PositionDocumentFieldsSchema.safeParse(
    positionDocument?.versions[0]?.content
  );

  if (!currentFields.success) {
    return { message: "No Position Document found to triage from." };
  }

  let draftScope;
  try {
    draftScope = await generateDraftScopeDocument(currentFields.data);
  } catch (error) {
    if (error instanceof TriageAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.document.create({
      data: {
        projectId,
        type: "DRAFT_SCOPE_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 4,
            content: draftScope,
            createdById: session?.user?.id,
          },
        },
      },
    });

    const [triageStage, specialistReviewStage] = await Promise.all([
      tx.stage.findUniqueOrThrow({ where: { number: 4 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 5 } }),
    ]);

    await tx.projectStageStatus.update({
      where: { projectId_stageId: { projectId, stageId: triageStage.id } },
      data: { status: "COMPLETE", completedAt: new Date() },
    });
    await tx.projectStageStatus.upsert({
      where: { projectId_stageId: { projectId, stageId: specialistReviewStage.id } },
      update: { status: "IN_PROGRESS" },
      create: {
        projectId,
        stageId: specialistReviewStage.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    await tx.project.update({ where: { id: projectId }, data: { currentStageNumber: 5 } });
  });

  revalidatePath(`/projects/${projectId}`);
}

const FeedbackSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, { error: "Paste the specialist leads' feedback before submitting." }),
});

export async function submitSpecialistFeedbackAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = FeedbackSchema.safeParse({ feedback: formData.get("feedback") });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.feedback?.[0] ?? "Invalid feedback.",
    };
  }

  const session = await auth();

  const draftScopeDocument = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "DRAFT_SCOPE_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const currentFields = DraftScopeDocumentSchema.safeParse(
    draftScopeDocument?.versions[0]?.content
  );

  if (!currentFields.success) {
    return { message: "No Draft Scope Document found to review." };
  }

  let deliverablesAndServices;
  try {
    deliverablesAndServices = await extractDeliverablesAndServices(
      currentFields.data,
      parsed.data.feedback
    );
  } catch (error) {
    if (error instanceof SpecialistReviewExtractionError) {
      return { message: error.message };
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.touchpointNote.create({
      data: {
        projectId,
        type: "SPECIALIST_REVIEW",
        content: parsed.data.feedback,
        createdById: session?.user?.id,
      },
    });

    await tx.document.create({
      data: {
        projectId,
        type: "DELIVERABLES_SERVICES_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 5,
            content: deliverablesAndServices,
            createdById: session?.user?.id,
          },
        },
      },
    });

    const [specialistReviewStage, estimationKickOffStage] = await Promise.all([
      tx.stage.findUniqueOrThrow({ where: { number: 5 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 6 } }),
    ]);

    await tx.projectStageStatus.update({
      where: { projectId_stageId: { projectId, stageId: specialistReviewStage.id } },
      data: { status: "COMPLETE", completedAt: new Date() },
    });
    await tx.projectStageStatus.upsert({
      where: { projectId_stageId: { projectId, stageId: estimationKickOffStage.id } },
      update: { status: "IN_PROGRESS" },
      create: {
        projectId,
        stageId: estimationKickOffStage.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    await tx.project.update({ where: { id: projectId }, data: { currentStageNumber: 6 } });
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function toggleChecklistItemAction(
  projectId: string,
  itemId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const isComplete = formData.get("isComplete") === "on";

  const result = await prisma.checklistItem.updateMany({
    where: { id: itemId, projectId },
    data: { isComplete, completedAt: isComplete ? new Date() : null },
  });

  if (result.count === 0) {
    return { message: "Checklist item not found." };
  }

  revalidatePath(`/projects/${projectId}`);
}

const OtherLabelSchema = z.object({
  otherLabel: z.string().trim().min(1, { error: "Label can't be empty." }),
});

export async function updateOtherServiceLabelAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = OtherLabelSchema.safeParse({ otherLabel: formData.get("otherLabel") });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.otherLabel?.[0] ?? "Invalid label.",
    };
  }

  const document = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "DELIVERABLES_SERVICES_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const latestVersion = document?.versions[0];
  const currentContent = DeliverablesServicesDocumentSchema.safeParse(latestVersion?.content);

  if (!document || !latestVersion || !currentContent.success) {
    return { message: "No Deliverables + Services Document found to update." };
  }

  // In-place edit, not a new version — this is a label correction, not a
  // stage-transition artifact (CLAUDE.md: version at stage transitions).
  await prisma.documentVersion.update({
    where: { id: latestVersion.id },
    data: {
      content: {
        ...currentContent.data,
        services: {
          ...currentContent.data.services,
          other: { ...currentContent.data.services.other, label: parsed.data.otherLabel },
        },
      },
    },
  });

  revalidatePath(`/projects/${projectId}`);
}
