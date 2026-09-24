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
import { PositionDocumentFieldsSchema, type PositionDocumentFields } from "@/types/intake";
import { DraftScopeDocumentSchema } from "@/types/triage";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";
import {
  CapabilityAssessmentError,
  assessCapabilities,
} from "@/services/agents/capability-assessment-agent";
import {
  EstimateBriefAgentError,
  generateEstimateBriefContent,
} from "@/services/agents/estimate-brief-agent";
import { renderEstimateBriefDocx } from "@/services/documents/estimate-brief-docx";
import { CapabilityEnum, type CapabilitySuggestion } from "@/types/capabilities";
import { SowAgentError, generateSowContent } from "@/services/agents/sow-agent";
import { renderSowDocx } from "@/services/documents/sow-docx";
import { assembleSowContext } from "@/lib/sow-context";
import type { SOWContent, SOWDocumentContent } from "@/types/sow";
import type { Capability } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { BRIEF_ATTRIBUTES, getBriefAttribute, type BriefAttributeValues } from "@/lib/briefAttributes";
import {
  attributeValuesEqual,
  attributeValuesFromFormData,
  normalizeAttributeValues,
  validateAttributeValues,
} from "@/lib/briefAttributeValues";
import { getBriefCompleteness, type BriefAttributeStatus } from "@/lib/briefCompleteness";
import { saveKeyAttributeSuggestions } from "@/lib/briefAttributeSuggestions";
import {
  extractKeyAttributesRecordingOutcome,
  suggestKeyAttributesFromProjectSources,
} from "@/lib/keyAttributeSources";
import { describeKnownKeyDetails, formatKeyDetailsForPrompt } from "@/lib/keyDetailsContext";
import { removeItemsCoveredByKeyDetails } from "@/services/agents/position-key-detail-filter";
import { formatPmPerspectiveForPrompt, getPmPerspectiveField } from "@/lib/pmPerspective";
import { getPmPerspectiveValues, savePmPerspective } from "@/lib/pmPerspectiveStore";

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
  // Existence is "has at least one version at all," not "has an ENABLED
  // one" — status is no longer a selectability gate for Rate Cards (see
  // uploadRateCardVersionAction in clients/[clientId]/actions.ts); archived
  // Rate Cards are also rejected here, matching the create-project dropdown.
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
            archivedAt: null,
            versions: { some: {} },
          },
          select: { id: true },
        })
      : null;
    if (!validRateCard) {
      return { message: "Selected rate card is not valid for this client." };
    }
    rateCardId = validRateCard.id;
  }

  const dates = {
    kickOffDate: parsed.data.kickOffDate ? new Date(parsed.data.kickOffDate) : null,
    targetCompletionDate: parsed.data.targetCompletionDate
      ? new Date(parsed.data.targetCompletionDate)
      : null,
  };
  const before = await prisma.project.findUnique({
    where: { id: projectId },
    select: { kickOffDate: true, targetCompletionDate: true },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      jobCode: emptyToNull(parsed.data.jobCode),
      ...dates,
      projectManagerId: emptyToNull(parsed.data.projectManagerId),
      rateCardId,
    },
  });

  if (before) {
    await recordProjectDateEdits(projectId, before, dates);
  }

  revalidatePath(`/projects/${projectId}`);
}

type ProjectDateColumns = { kickOffDate: Date | null; targetCompletionDate: Date | null };

function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Editing kick-off/target dates in the project summary is a PM entry for
 * any attribute whose sub-fields mirror those columns (projectDateFields in
 * src/lib/briefAttributes.ts) — recorded as a new confirmed value that
 * keeps the attribute's other confirmed sub-fields.
 */
async function recordProjectDateEdits(
  projectId: string,
  before: ProjectDateColumns,
  after: ProjectDateColumns
) {
  const session = await auth();
  const completeness = await getBriefCompleteness(projectId);

  for (const attribute of BRIEF_ATTRIBUTES) {
    const mapping = Object.entries(attribute.projectDateFields ?? {}).flatMap(([subFieldId, column]) =>
      column ? [[subFieldId, column] as const] : []
    );
    if (!mapping.some(([, column]) => isoDate(before[column]) !== isoDate(after[column]))) continue;

    const current = completeness.attributes.find((a) => a.id === attribute.id)?.confirmed?.values;
    const values: BriefAttributeValues = normalizeAttributeValues(attribute, current ?? {});
    for (const [subFieldId, column] of mapping) {
      values[subFieldId] = isoDate(after[column]);
    }

    await prisma.briefAttributeValue.create({
      data: {
        projectId,
        attributeId: attribute.id,
        kind: "CONFIRMED",
        source: "PM_ENTRY",
        values: values as Prisma.InputJsonValue,
        createdById: session?.user?.id,
      },
    });
  }
}

const StartSowDevelopmentSchema = z.object({
  sowTemplateId: z.string().trim().min(1, { error: "Select a SOW Template." }),
  sowTemplateVersionId: z.string().trim().min(1, { error: "Select a version of the chosen template." }),
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
    sowTemplateVersionId: formData.get("sowTemplateVersionId"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      message: errors.sowTemplateId?.[0] ?? errors.sowTemplateVersionId?.[0] ?? "Select a SOW Template.",
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

  // Pins the specific SOWTemplateVersion in effect when it was selected — a
  // later upload (which never supersedes) can't silently change which
  // version this Project is using (Rule 2 audit gap).
  const validTemplateVersion = await prisma.sOWTemplateVersion.findFirst({
    where: { id: parsed.data.sowTemplateVersionId, sowTemplateId: validTemplate.id },
    select: { id: true },
  });
  if (!validTemplateVersion) {
    return { message: "Select a version of the chosen template." };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { sowTemplateId: validTemplate.id, sowTemplateVersionId: validTemplateVersion.id },
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * "Generate SOW" — assembles everything already captured about the
 * project, drafts fresh SOW content guided by the selected template's
 * structure (never a mail-merge — see sow-agent.ts), renders a real .docx,
 * and always adds a new SOWVersion (never overwrites), snapshotting which
 * template/version actually informed it. Kept separate from
 * startSowDevelopmentAction (template selection) rather than combined:
 * changing which template is pinned is a legitimate standalone action a PM
 * may take without wanting an immediate regeneration.
 */
export interface MissingBriefAttribute {
  id: string;
  label: string;
  question: string;
  status: BriefAttributeStatus;
  missingSubFields: { id: string; label: string }[];
}

export interface GenerateSowActionState extends ActionState {
  /** Set when the SOW was refused because required key attributes aren't confirmed. */
  missingAttributes?: MissingBriefAttribute[];
}

export async function generateSowAction(
  projectId: string,
  _prevState: GenerateSowActionState | undefined,
  _formData: FormData
): Promise<GenerateSowActionState | undefined> {
  const session = await auth();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, sowTemplateId: true, sowTemplateVersionId: true },
  });
  if (!project) {
    return { message: "Project not found." };
  }
  if (!project.sowTemplateVersionId) {
    return { message: "Select a SOW Template before generating." };
  }

  const templateVersion = await prisma.sOWTemplateVersion.findUnique({
    where: { id: project.sowTemplateVersionId },
    select: { extractedText: true },
  });
  if (!templateVersion) {
    return { message: "Selected SOW Template version no longer exists." };
  }

  // The brief gate: every required key attribute must be PM-confirmed.
  // Enforced here, server-side — the panel's alert is just the explanation.
  const completeness = await getBriefCompleteness(projectId);
  if (!completeness.canProceed) {
    return {
      message: "We can't generate the SOW yet — confirm these key details first.",
      missingAttributes: completeness.requiredOutstanding.map((a) => ({
        id: a.id,
        label: a.label,
        question: a.question,
        status: a.status,
        missingSubFields: a.missingSubFields,
      })),
    };
  }

  const { narrativeContext, coverDetails } = await assembleSowContext(projectId);

  let body: SOWDocumentContent;
  try {
    body = await generateSowContent(narrativeContext, templateVersion.extractedText);
  } catch (error) {
    if (error instanceof SowAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  const content: SOWContent = { coverDetails, body };
  const fileBytes = new Uint8Array(await renderSowDocx(content));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.sOW.findUnique({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    const versionNumber = (existing?.versions[0]?.versionNumber ?? 0) + 1;
    const fileName = `SOW - ${project.name} - v${versionNumber}.docx`;
    const versionData = {
      versionNumber,
      fileName,
      fileBytes,
      content: content as unknown as Prisma.InputJsonValue,
      sowTemplateId: project.sowTemplateId,
      sowTemplateVersionId: project.sowTemplateVersionId,
      createdById: session?.user?.id,
    };

    if (existing) {
      await tx.sOWVersion.create({ data: { sowId: existing.id, ...versionData } });
      return;
    }

    await tx.sOW.create({
      data: { projectId, versions: { create: versionData } },
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

const FeedbackSchema = z
  .object({
    feedback: z
      .string()
      .trim()
      .min(1, { error: "Paste the specialist leads' feedback before submitting." }),
    capability: z.union([CapabilityEnum, z.literal("OTHER")], {
      error: "Choose which capability team this feedback is from.",
    }),
    otherLabel: z.string().trim().optional(),
  })
  .refine((data) => data.capability !== "OTHER" || !!data.otherLabel, {
    error: "Name the capability team when selecting \"Other\".",
    path: ["otherLabel"],
  });

export async function submitSpecialistFeedbackAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = FeedbackSchema.safeParse({
    feedback: formData.get("feedback"),
    capability: formData.get("capability"),
    otherLabel: formData.get("otherLabel") || undefined,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      message:
        errors.feedback?.[0] ?? errors.capability?.[0] ?? errors.otherLabel?.[0] ?? "Invalid feedback.",
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
        capability: parsed.data.capability === "OTHER" ? null : parsed.data.capability,
        otherCapabilityLabel: parsed.data.capability === "OTHER" ? parsed.data.otherLabel : null,
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

/**
 * The single place any new information enters a project — pasted notes or
 * an uploaded file. Always adds a KnowledgeItem for the chatbot, and (this
 * used to be a separate "Add a client update" action/panel — merged here so
 * there's one input point instead of two that looked like they did the same
 * thing) also re-runs the clarification extraction against the Position
 * Document's current state when one exists, appending a new version and a
 * timestamped CLARIFICATION_REPLY TouchpointNote. Usable repeatedly at any
 * time in Phase 1, not gated behind a single one-time step.
 */
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

  const positionDocument = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const latestVersion = positionDocument?.versions[0];
  const currentFields = PositionDocumentFieldsSchema.safeParse(latestVersion?.content);

  let updatedFields: PositionDocumentFields | undefined;
  if (positionDocument && latestVersion && currentFields.success) {
    try {
      updatedFields = await extractClarificationUpdate(
        currentFields.data,
        content,
        await getPmPerspectiveValues(projectId)
      );
    } catch (error) {
      if (error instanceof ClarificationExtractionError) {
        return { message: error.message };
      }
      throw error;
    }
  }

  // Key attributes are a bonus here, not the point of the upload — if this
  // call fails the input is still saved, and the PM can re-run "Suggest from
  // brief & inputs" later.
  const keyAttributes = await extractKeyAttributesRecordingOutcome(projectId, content, "update");

  // Each key detail is recorded once: drop anything from the updated
  // Position Document that the key details (known + just read) already cover.
  if (updatedFields) {
    const knownKeyDetails = describeKnownKeyDetails(await getBriefCompleteness(projectId), keyAttributes);
    updatedFields = {
      ...updatedFields,
      whatWeKnow: await removeItemsCoveredByKeyDetails(updatedFields.whatWeKnow, knownKeyDetails),
    };
  }

  const knowledgeItem = await prisma.$transaction(async (tx) => {
    const item = await tx.knowledgeItem.create({
      data: {
        projectId,
        type: hasFile ? "DOCUMENT" : "NOTE",
        title: parsed.data.title,
        content,
        originalFileName,
        uploadedById: session?.user?.id,
      },
    });

    if (updatedFields && positionDocument && latestVersion) {
      await tx.touchpointNote.create({
        data: {
          projectId,
          type: "CLARIFICATION_REPLY",
          content,
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
    }
    return item;
  });

  if (keyAttributes) {
    await saveKeyAttributeSuggestions(projectId, [
      { extraction: keyAttributes, source: "UPDATE", knowledgeItemId: knowledgeItem.id },
    ]);
  }

  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Brief key attributes
// ---------------------------------------------------------------------------

/**
 * The only way an attribute becomes confirmed: a PM submits its values
 * (typed in, or an AI suggestion accepted as-is or edited). Saving a
 * partial value is allowed — the attribute just stays "partial". Source is
 * the suggestion's own (e.g. BRIEF) when accepted unchanged, otherwise
 * PM_ENTRY. Attributes whose sub-fields mirror project dates write those
 * columns too, so there's one source of truth for them.
 */
export async function confirmBriefAttributeAction(
  projectId: string,
  attributeId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) {
    return { message: "Unknown key detail." };
  }

  const values = attributeValuesFromFormData(attribute, formData);
  const formatError = validateAttributeValues(attribute, values);
  if (formatError) {
    return { message: formatError };
  }

  let source: Prisma.BriefAttributeValueCreateInput["source"] = "PM_ENTRY";
  const suggestionId = formData.get("suggestionId");
  if (typeof suggestionId === "string" && suggestionId) {
    const suggestion = await prisma.briefAttributeValue.findFirst({
      where: { id: suggestionId, projectId, attributeId, kind: "SUGGESTION" },
    });
    if (
      suggestion &&
      attributeValuesEqual(normalizeAttributeValues(attribute, suggestion.values), values)
    ) {
      source = suggestion.source;
    }
  }

  const session = await auth();
  const dateColumns = Object.entries(attribute.projectDateFields ?? {}).flatMap(
    ([subFieldId, column]) => (column ? [[subFieldId, column] as const] : [])
  );

  await prisma.$transaction(async (tx) => {
    await tx.briefAttributeValue.create({
      data: {
        projectId,
        attributeId,
        kind: "CONFIRMED",
        source,
        values: values as Prisma.InputJsonValue,
        createdById: session?.user?.id,
      },
    });
    if (dateColumns.length > 0) {
      await tx.project.update({
        where: { id: projectId },
        data: Object.fromEntries(
          dateColumns.map(([subFieldId, column]) => {
            const value = values[subFieldId];
            return [column, typeof value === "string" ? new Date(value) : null];
          })
        ),
      });
    }
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * On demand: re-reads the stored brief and every Additional Input (oldest
 * first) and proposes key-attribute values from them — e.g. for projects
 * created before key attributes existed. Suggestions only; nothing is
 * confirmed.
 */
export async function suggestBriefAttributesAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return { message: "Project not found." };
  }

  const { error } = await suggestKeyAttributesFromProjectSources(projectId);
  revalidatePath(`/projects/${projectId}`);
  if (error) {
    return { message: error };
  }
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

// ---------------------------------------------------------------------------
// End-of-Phase-1: Capabilities & Estimate Brief. Additive — never gates
// Stage 2. See CLAUDE.md's Data Flow section and prisma/schema.prisma's
// Capability/ProjectCapability/EstimateBrief models.
// ---------------------------------------------------------------------------

/**
 * Everything captured about this project's brief so far — raw brief text,
 * Position Document, Draft Scope Document, and logged client updates — for
 * the capability-assessment and estimate-brief agents to reason from. Every
 * query below is scoped by `projectId`, matching the chatbot's isolation
 * pattern (CLAUDE.md: project scoping enforced at the query layer, never by
 * prompting alone) even though this feature has no cross-project surface of
 * its own.
 */
async function assembleCapabilityBriefContext(projectId: string): Promise<string> {
  const [project, positionDocument, draftScopeDocument, clientUpdates, pmPerspective, briefCompleteness] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { briefRawText: true } }),
    prisma.document.findUnique({
      where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    }),
    prisma.document.findUnique({
      where: { projectId_type: { projectId, type: "DRAFT_SCOPE_DOCUMENT" } },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    }),
    prisma.touchpointNote.findMany({
      where: { projectId, type: "CLARIFICATION_REPLY" },
      orderBy: { createdAt: "asc" },
    }),
    getPmPerspectiveValues(projectId),
    getBriefCompleteness(projectId),
  ]);

  const sections: string[] = [];
  if (project?.briefRawText) {
    sections.push(`## Original brief\n${project.briefRawText}`);
  }
  // Key details are their own record (the Position Document no longer
  // carries them). Internal specialist context, so unconfirmed suggestions
  // are included — clearly marked as such.
  const keyDetails = formatKeyDetailsForPrompt(briefCompleteness, { includeUnconfirmed: true });
  if (keyDetails) {
    sections.push(`## Key details\n${keyDetails}`);
  }
  const positionContent = positionDocument?.versions[0]?.content;
  if (positionContent) {
    sections.push(`## Position Document\n${JSON.stringify(positionContent)}`);
  }
  const draftScopeContent = draftScopeDocument?.versions[0]?.content;
  if (draftScopeContent) {
    sections.push(`## Draft Scope Document\n${JSON.stringify(draftScopeContent)}`);
  }
  for (const update of clientUpdates) {
    sections.push(`## Client update\n${update.content}`);
  }
  // The PM's own view — always its own labelled block, never mixed into
  // what the client said.
  const pmBlock = formatPmPerspectiveForPrompt(pmPerspective);
  if (pmBlock) {
    sections.push(`## PM perspective (the PM's view, not the client's)\n${pmBlock}`);
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "No brief content has been captured for this project yet.";
}

export interface CapabilitySuggestionActionState extends ActionState {
  suggestions?: CapabilitySuggestion[];
  isLowConfidence?: boolean;
  lowConfidenceReason?: string | null;
}

/**
 * "Not sure? Get suggestions" — never writes anything. Suggestions are
 * returned to the client component, which pre-checks them in the
 * capability multi-select's local state; only submitting that form (see
 * updateConfirmedCapabilitiesAction) actually confirms anything.
 */
export async function suggestCapabilitiesAction(
  projectId: string,
  _prevState: CapabilitySuggestionActionState | undefined,
  _formData: FormData
): Promise<CapabilitySuggestionActionState> {
  const briefContext = await assembleCapabilityBriefContext(projectId);

  try {
    const assessment = await assessCapabilities(briefContext);
    return {
      suggestions: assessment.suggestions,
      isLowConfidence: assessment.isLowConfidence,
      lowConfidenceReason: assessment.lowConfidenceReason,
    };
  } catch (error) {
    if (error instanceof CapabilityAssessmentError) {
      return { message: error.message };
    }
    throw error;
  }
}

/**
 * Saves the confirmed capability multi-select as this Project's single
 * source of truth — a full replace of whatever's checked, not a diff/patch,
 * so unchecking a capability actually removes it. Editable at any time,
 * including after an EstimateBrief version already exists (see
 * generateEstimateBriefAction's staleness check on the read side).
 */
export async function updateConfirmedCapabilitiesAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = z.array(CapabilityEnum).safeParse(formData.getAll("capabilities").map(String));
  if (!parsed.success) {
    return { message: "Invalid capability selection." };
  }

  const capabilities = Array.from(new Set(parsed.data));

  await prisma.$transaction(async (tx) => {
    await tx.projectCapability.deleteMany({ where: { projectId } });
    if (capabilities.length > 0) {
      await tx.projectCapability.createMany({
        data: capabilities.map((capability) => ({ projectId, capability })),
      });
    }
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * "Prepare the estimate brief" — generates the shared overview + one
 * section per confirmed capability, renders it to a real .docx, and always
 * adds a new EstimateBriefVersion snapshotting which capabilities were
 * included (never overwrites a prior version).
 */
export async function generateEstimateBriefAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();

  const [project, confirmedCapabilities] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    prisma.projectCapability.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!project) {
    return { message: "Project not found." };
  }
  if (confirmedCapabilities.length === 0) {
    return { message: "Confirm at least one capability before preparing the estimate brief." };
  }

  const capabilities: Capability[] = confirmedCapabilities.map((c) => c.capability);
  const briefContext = await assembleCapabilityBriefContext(projectId);

  let content;
  try {
    content = await generateEstimateBriefContent(briefContext, capabilities);
  } catch (error) {
    if (error instanceof EstimateBriefAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  const fileBytes = new Uint8Array(await renderEstimateBriefDocx(content));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.estimateBrief.findUnique({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    const versionNumber = (existing?.versions[0]?.versionNumber ?? 0) + 1;
    const fileName = `Estimate Brief - ${project.name} - v${versionNumber}.docx`;

    if (existing) {
      await tx.estimateBriefVersion.create({
        data: {
          estimateBriefId: existing.id,
          versionNumber,
          fileName,
          fileBytes,
          content,
          capabilities,
          createdById: session?.user?.id,
        },
      });
      return;
    }

    await tx.estimateBrief.create({
      data: {
        projectId,
        versions: {
          create: {
            versionNumber: 1,
            fileName,
            fileBytes,
            content,
            capabilities,
            createdById: session?.user?.id,
          },
        },
      },
    });
  });

  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// PM perspective
// ---------------------------------------------------------------------------

/**
 * Edits one PM perspective field after intake. Records who edited it and
 * when (per field). Changing Early KPIs re-offers them as a PM-entry
 * suggestion for the Objective's success measures — never confirmed here.
 * Doesn't touch documents already generated (update propagation is a
 * separate task).
 */
export async function updatePmPerspectiveFieldAction(
  projectId: string,
  fieldId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  if (!getPmPerspectiveField(fieldId)) {
    return { message: "Unknown PM perspective field." };
  }
  const content = formData.get("content");
  const session = await auth();
  await savePmPerspective(
    projectId,
    { [fieldId]: typeof content === "string" ? content : "" },
    session?.user?.id ?? null
  );
  revalidatePath(`/projects/${projectId}`);
}
