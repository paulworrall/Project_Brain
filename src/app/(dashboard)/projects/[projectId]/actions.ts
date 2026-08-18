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
import { ChatbotError, answerProjectQuestion } from "@/services/agents/chatbot";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";
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
  rateCardId: z.string().trim().optional(),
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
    rateCardId: formData.get("rateCardId"),
  });
  if (!parsed.success) {
    return { message: "Invalid project details." };
  }

  // Re-validate server-side that a submitted Rate Card actually belongs to
  // this Project's own Client — the edit form's dropdown is already scoped,
  // but this is the real enforcement point, not the dropdown's contents.
  let rateCardId: string | null = null;
  if (parsed.data.rateCardId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workstream: { select: { clientId: true } } },
    });
    const validRateCard = project
      ? await prisma.rateCard.findFirst({
          where: {
            id: parsed.data.rateCardId,
            clientId: project.workstream.clientId,
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

  await prisma.project.update({
    where: { id: projectId },
    data: {
      jobCode: emptyToNull(parsed.data.jobCode),
      kickOffDate: parsed.data.kickOffDate ? new Date(parsed.data.kickOffDate) : null,
      targetCompletionDate: parsed.data.targetCompletionDate
        ? new Date(parsed.data.targetCompletionDate)
        : null,
      projectManagerId: emptyToNull(parsed.data.projectManagerId),
      rateCardId,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

const StartSowDevelopmentSchema = z.object({
  sowTemplateId: z.string().trim().min(1, { error: "Select a SOW Template." }),
});

/**
 * Records which SOW Template a PM picked to start SOW development — a
 * Project field write, not a document write, so (per CLAUDE.md's role
 * boundary) both roles may call this; only writes to the commercial
 * documents themselves are ClientEngagement-only. Re-validates server-side
 * that the submitted template is either the global baseline or belongs to
 * this Project's own Client — the same isolation pattern already used for
 * Rate Cards, never trusting the (already-scoped) dropdown alone. The
 * actual SOW-generation agent that consumes this selection is future/Level
 * 3 scope — this only records the choice.
 */
export async function startSowDevelopmentAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = StartSowDevelopmentSchema.safeParse({
    sowTemplateId: formData.get("sowTemplateId"),
  });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.sowTemplateId?.[0] ?? "Select a SOW Template.",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workstream: { select: { clientId: true } } },
  });
  const validTemplate = project
    ? await prisma.sOWTemplate.findFirst({
        where: {
          id: parsed.data.sowTemplateId,
          OR: [{ clientId: null }, { clientId: project.workstream.clientId }],
        },
        select: { id: true },
      })
    : null;
  if (!validTemplate) {
    return { message: "Selected SOW Template is not valid for this client." };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { sowTemplateId: validTemplate.id },
  });

  revalidatePath(`/projects/${projectId}`);
}

const NotesSchema = z.object({
  notes: z.string().trim().min(1, { error: "Add some detail before submitting." }),
});

/**
 * "Add a client update" — usable at any time in Phase 1, not gated behind a
 * single one-time step. Each submission re-runs the clarification extraction
 * against the Position Document's current state, appends a new version, and
 * leaves a timestamped TouchpointNote in the log. Never marks anything
 * "complete" — Phase 1 doesn't have a discrete step here to complete; the
 * Position Document just keeps evolving until Draft Scope Document
 * generation is triggered (see generateDraftScopeDocumentAction).
 */
export async function submitClientUpdateAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = NotesSchema.safeParse({ notes: formData.get("notes") });
  if (!parsed.success) {
    return { message: z.flattenError(parsed.error).fieldErrors.notes?.[0] ?? "Invalid update." };
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
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * "Generate / refresh" the Draft Scope Document — an explicit action the
 * user triggers whenever they choose, using the Position Document's current
 * state (including whatever client updates have been submitted so far) as
 * input. Repeatable: the first run also completes Stage 3/4 and unlocks
 * Stage 5 for Phase 2 (mirroring the old auto-triggered behaviour once);
 * later re-runs just append a new version without re-triggering that
 * transition, so regenerating after specialist review has begun doesn't
 * regress it back out of progress.
 */
export async function generateDraftScopeDocumentAction(
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
    return { message: "No Position Document found to generate a Draft Scope Document from." };
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
    const existingDocument = await tx.document.findUnique({
      where: { projectId_type: { projectId, type: "DRAFT_SCOPE_DOCUMENT" } },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (existingDocument) {
      await tx.documentVersion.create({
        data: {
          documentId: existingDocument.id,
          versionNumber: (existingDocument.versions[0]?.versionNumber ?? 0) + 1,
          stageNumber: 4,
          content: draftScope,
          createdById: session?.user?.id,
        },
      });
      return;
    }

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

    const [getClarificationsStage, triageStage, specialistReviewStage] = await Promise.all([
      tx.stage.findUniqueOrThrow({ where: { number: 3 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 4 } }),
      tx.stage.findUniqueOrThrow({ where: { number: 5 } }),
    ]);

    // upsert, not update — a project created before this Phase 1 rework may
    // not have a Stage 3 status row at all (it used to only appear once a
    // clarification reply was submitted).
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
      update: { status: "COMPLETE", completedAt: new Date() },
      create: {
        projectId,
        stageId: triageStage.id,
        status: "COMPLETE",
        startedAt: new Date(),
        completedAt: new Date(),
      },
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

const ChecklistDetailSchema = z.object({
  detailText: z.string().trim().optional(),
});

/**
 * Persists a checklist item's freeform detail (e.g. job code, folder URL)
 * independently of its isComplete checkbox — always editable regardless of
 * completion state, via its own action so the two never interfere.
 */
export async function updateChecklistItemDetailAction(
  projectId: string,
  itemId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = ChecklistDetailSchema.safeParse({ detailText: formData.get("detailText") });
  if (!parsed.success) {
    return { message: "Invalid detail text." };
  }

  const result = await prisma.checklistItem.updateMany({
    where: { id: itemId, projectId },
    data: { detailText: parsed.data.detailText ? parsed.data.detailText : null },
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

const KnowledgeItemSchema = z.object({
  title: z.string().trim().min(1, { error: "Give this item a short title." }),
  content: z.string().trim().optional(),
});

export async function uploadKnowledgeItemAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = KnowledgeItemSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.title?.[0] ?? "Invalid knowledge item.",
    };
  }

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  const hasPastedText = !!parsed.data.content;

  if (!hasFile && !hasPastedText) {
    return { message: "Paste some notes or upload a file." };
  }
  if (hasFile && hasPastedText) {
    return { message: "Provide either pasted notes or a file, not both." };
  }

  const session = await auth();

  let content: string;
  let originalFileName: string | null = null;

  if (hasFile && file instanceof File) {
    originalFileName = file.name;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      content = await parseDocumentToText(buffer, file.name);
    } catch (error) {
      if (error instanceof UnsupportedBriefFormatError) {
        return { message: error.message };
      }
      return { message: "Couldn't read that file. Try pasting the notes instead." };
    }
  } else {
    content = parsed.data.content!;
  }

  if (content.trim().length === 0) {
    return { message: "That upload appears to be empty." };
  }

  await prisma.knowledgeItem.create({
    data: {
      projectId,
      type: hasFile ? "DOCUMENT" : "NOTE",
      title: parsed.data.title,
      content,
      originalFileName,
      uploadedById: session?.user?.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

const QuestionSchema = z.object({
  question: z.string().trim().min(1, { error: "Ask a question before submitting." }),
});

export interface ChatbotActionState {
  answer?: string;
  message?: string;
}

export async function askChatbotAction(
  projectId: string,
  _prevState: ChatbotActionState | undefined,
  formData: FormData
): Promise<ChatbotActionState> {
  const parsed = QuestionSchema.safeParse({ question: formData.get("question") });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.question?.[0] ?? "Invalid question.",
    };
  }

  try {
    const answer = await answerProjectQuestion(projectId, parsed.data.question);
    return { answer };
  } catch (error) {
    if (error instanceof ChatbotError) {
      return { message: error.message };
    }
    throw error;
  }
}
