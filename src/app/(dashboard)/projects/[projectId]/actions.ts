"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ClarificationExtractionError,
  extractClarificationUpdate,
} from "@/services/agents/clarification-extraction";
import {
  SpecialistReviewExtractionError,
  extractDeliverablesAndServices,
} from "@/services/agents/specialist-review-extraction";
import { ChatbotError, answerProjectQuestion } from "@/services/agents/chatbot";
import { summariseUpdate } from "@/services/agents/update-summary";
import { runAfterResponse } from "@/lib/afterResponse";
import { formatVersionsBefore, nextUpdateVersion } from "@/lib/updateVersions";
import { getProjectContext } from "@/lib/projectContext";
import { latestPositionDocumentContent } from "@/lib/positionDocument";
import { rebuildPositionDocumentVersion, redraftClarificationEmail } from "@/lib/outputRegeneration";
import { IntakeAgentError } from "@/services/agents/intake-agent";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";
import { PositionDocumentFieldsSchema, type PositionDocumentFields } from "@/types/intake";
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
import { timelineSection } from "@/lib/briefAttributeDisplay";
import {
  CapabilityEnum,
  EstimateBriefContentSchema,
  type CapabilitySuggestion,
} from "@/types/capabilities";
import { SowAgentError, generateSowContent } from "@/services/agents/sow-agent";
import { renderSowDocx } from "@/services/documents/sow-docx";
import { assembleSowContext, formatSowDate } from "@/lib/sow-context";
import { getSowSyncStatus } from "@/lib/sowSync";
import { checkSowPreconditions } from "@/lib/sowPreconditions";
import { completeSowReview, listSowItems, validatedListsFromItems } from "@/lib/sowItems";
import { snapshotItems } from "@/lib/sowReview";
import type { SOWContent, SOWDocumentContent } from "@/types/sow";
import type { Capability, UpdateSource } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { BRIEF_ATTRIBUTES, getBriefAttribute, type BriefAttributeValues } from "@/lib/briefAttributes";
import {
  attributeValuesFromFormData,
  normalizeAttributeValues,
  validateAttributeValues,
} from "@/lib/briefAttributeValues";
import { getBriefCompleteness, type BriefAttributeStatus } from "@/lib/briefCompleteness";
import { saveCapturedKeyAttributes } from "@/lib/briefAttributeCapture";
import {
  extractKeyAttributesRecordingOutcome,
  fillKeyAttributeGapsFromProjectSources,
} from "@/lib/keyAttributeSources";
import { describeKnownKeyDetails } from "@/lib/keyDetailsContext";
import { removeItemsCoveredByKeyDetails } from "@/services/agents/position-key-detail-filter";
import { getPmPerspectiveField } from "@/lib/pmPerspective";
import { savePmPerspective } from "@/lib/pmPerspectiveStore";

export interface ActionState {
  /** Something went wrong; nothing (or not everything) was saved. */
  message?: string;
  /** Saved, with something the user should know. */
  notice?: string;
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

    const current = completeness.attributes.find((a) => a.id === attribute.id)?.current?.values;
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
 * "Generate SOW" — the composition step. Takes the items the PM validated in
 * the review overlay (SowSectionItem) plus everything already captured about
 * the project, and drafts the SOW narrative guided by the selected template's
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
  /** Set when the SOW was refused because required key attributes are still missing. */
  missingAttributes?: MissingBriefAttribute[];
}

export async function generateSowAction(
  projectId: string,
  _prevState: GenerateSowActionState | undefined,
  _formData: FormData
): Promise<GenerateSowActionState | undefined> {
  const session = await auth();

  // Project exists, template selected, brief gate passed — enforced here,
  // server-side; the panel's alert is just the explanation.
  const preconditions = await checkSowPreconditions(projectId);
  if (!preconditions.ok) {
    return preconditions.failure;
  }
  const project = {
    name: preconditions.projectName,
    sowTemplateId: preconditions.sowTemplateId,
    sowTemplateVersionId: preconditions.sowTemplateVersionId,
  };

  const { narrativeContext, coverDetails, builtFromVersion, sourceEstimate } =
    await assembleSowContext(projectId);
  // Every new SOW records the exact estimate version its commercials came from.
  if (!sourceEstimate) {
    return { message: "Save an estimate version before generating the SOW — its fees come from the estimate." };
  }

  // The SOW is composed ONLY from the items the PM validated (SowSectionItem):
  // included, non-blank, in position order. Deliverables is required.
  const items = await listSowItems(projectId);
  const validated = validatedListsFromItems(items);
  if (validated.deliverables.length === 0) {
    return { message: "Review the SOW content first — include at least one deliverable before generating." };
  }
  const itemsSnapshot = snapshotItems(items);

  let body: SOWDocumentContent;
  try {
    body = await generateSowContent(narrativeContext, preconditions.templateText, validated);
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
      builtFromVersion,
      sourceEstimateVersionId: sourceEstimate.estimateVersionId,
      sourceEstimateTotal: sourceEstimate.total,
      sourceEstimateCurrency: sourceEstimate.currency,
      sourceEstimateCapabilities: sourceEstimate.capabilities,
      itemsSnapshot: itemsSnapshot as unknown as Prisma.InputJsonValue,
      createdById: session?.user?.id,
    };

    if (existing) {
      await tx.sOWVersion.create({ data: { sowId: existing.id, ...versionData } });
    } else {
      await tx.sOW.create({
        data: { projectId, versions: { create: versionData } },
      });
    }
    // The review is done: clear "new since last review" and reset its step.
    await completeSowReview(tx, projectId);
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * Completes Phase 1: marks Stage 3 (Get Clarifications) and Stage 4 (Triage)
 * complete, opens Stage 5 (Review with Specialist Leads) and moves the
 * project to it. Runs when the Estimate Brief is prepared, and only
 * for a project that hasn't reached Stage 5 yet, so it never moves a project
 * backwards. (This used to happen on the first Draft Scope Document, which
 * has been removed.)
 */
async function completePhase1(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
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

  const [latestEstimateBrief, position, context] = await Promise.all([
    prisma.estimateBriefVersion.findFirst({
      where: { estimateBrief: { projectId } },
      orderBy: { versionNumber: "desc" },
      select: { content: true },
    }),
    latestPositionDocumentContent(projectId),
    getProjectContext(projectId),
  ]);
  const briefCompleteness = context.keyDetails;
  const estimateBrief = EstimateBriefContentSchema.safeParse(latestEstimateBrief?.content);
  if (!estimateBrief.success) {
    return { message: "Prepare the Estimate Brief in Phase 1 before adding specialist feedback." };
  }
  const outstandingGaps = [
    ...briefCompleteness.requiredOutstanding.map((a) =>
      a.status === "partial"
        ? `${a.label}: still missing ${a.missingSubFields.map((f) => f.label).join(", ")}`
        : `${a.label}: not captured yet`
    ),
    ...(position?.clientFlaggedOpenItems ?? []),
  ];

  let deliverablesAndServices;
  try {
    deliverablesAndServices = await extractDeliverablesAndServices(
      { estimateBrief: estimateBrief.data, outstandingGaps, projectContext: context.text },
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

/**
 * The single place any new information enters a project — pasted notes or
 * an uploaded file, with no title (it's labelled from its date and type; see
 * src/lib/updateLabel.ts). Always saves a KnowledgeItem, and (this used to
 * be a separate "Add a client update" action/panel — merged here so there's
 * one input point instead of two that looked like they did the same thing)
 * also re-runs the clarification extraction against the Position Document's
 * current state when one exists (with the full project context as
 * background), appending a new version that records the update it was built
 * from. If that refresh fails the update is still saved, with a notice. A one-line AI summary is added after the
 * response — never blocking the save. Usable repeatedly at any time.
 */
export async function uploadKnowledgeItemAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const pasted = formData.get("content");
  const pastedText = typeof pasted === "string" ? pasted.trim() : "";

  const sourceField = formData.get("source") || "CLIENT";
  if (sourceField !== "CLIENT" && sourceField !== "INTERNAL_TEAM") {
    return { message: "Choose whether this update is from the client or the internal team." };
  }
  const source: UpdateSource = sourceField;

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  const hasPastedText = !!pastedText;

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
    content = pastedText;
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

  // The update itself always gets saved; if the Position Document can't be
  // refreshed from it, the PM is told rather than losing what they added.
  let updatedFields: PositionDocumentFields | undefined;
  let positionDocumentNotice: string | undefined;
  if (positionDocument && latestVersion && currentFields.success) {
    try {
      const context = await getProjectContext(projectId);
      updatedFields = await extractClarificationUpdate(
        currentFields.data,
        content,
        context.pmPerspective,
        context.text
      );
    } catch (error) {
      if (!(error instanceof ClarificationExtractionError)) {
        throw error;
      }
      console.error("Position Document refresh from an update failed:", error);
      positionDocumentNotice = `Update saved, but the Position Document couldn't be refreshed from it this time (${error.message}).`;
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
    // Each update is the next version of the brief (the brief is v1).
    const item = await tx.knowledgeItem.create({
      data: {
        projectId,
        type: hasFile ? "DOCUMENT" : "NOTE",
        content,
        originalFileName,
        source,
        versionNumber: await nextUpdateVersion(tx, projectId),
        uploadedById: session?.user?.id,
      },
    });

    // The update itself is the record; no separate client-reply copy is kept.
    if (updatedFields && positionDocument && latestVersion) {
      await tx.documentVersion.create({
        data: {
          documentId: positionDocument.id,
          versionNumber: latestVersion.versionNumber + 1,
          stageNumber: 3,
          content: updatedFields,
          builtFromVersion: item.versionNumber,
          createdById: session?.user?.id,
        },
      });
    }
    return item;
  });

  if (keyAttributes) {
    await saveCapturedKeyAttributes(projectId, [
      { extraction: keyAttributes, source: "UPDATE", knowledgeItemId: knowledgeItem.id },
    ]);
  }

  // Optional, and after the response: the date label stands on its own
  // until (or unless) these land.
  runAfterResponse(async () => {
    try {
      const { summary, changeSummary } = await summariseUpdate({
        content,
        before: await formatVersionsBefore(projectId, knowledgeItem.versionNumber!),
      });
      await prisma.knowledgeItem.update({
        where: { id: knowledgeItem.id },
        data: { summary, changeSummary },
      });
    } catch (error) {
      console.error("Update summary failed; the update keeps its date label:", error);
    }
  });

  // A fresh draft of the client email from the latest context, as a new
  // version (earlier drafts are kept). Only ever a draft — nothing is sent.
  // If it fails the email stays flagged stale, with a Regenerate button.
  runAfterResponse(async () => {
    try {
      await redraftClarificationEmail(projectId, null, knowledgeItem.versionNumber);
    } catch (error) {
      console.error("Clarification email redraft after an update failed:", error);
    }
  });

  revalidatePath(`/projects/${projectId}`);
  const draftNotice = `Saved as v${knowledgeItem.versionNumber}. A fresh client email draft is being written from it — refresh in a moment to see it.`;
  return { notice: positionDocumentNotice ? `${positionDocumentNotice} ${draftNotice}` : draftNotice };
}

// ---------------------------------------------------------------------------
// Brief key attributes
// ---------------------------------------------------------------------------

/**
 * A PM's inline Update/Add for one key detail. Always recorded as the PM's
 * own entry ("Edited by PM", with who and when), replacing whatever was
 * captured. Saving it empty returns the detail to Missing. Attributes whose
 * sub-fields mirror project dates write those columns too, so there's one
 * source of truth for them.
 */
export async function saveBriefAttributeAction(
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
        source: "PM_ENTRY",
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
 * first) and fills in any key details still empty — e.g. after an
 * extraction failure. Never overwrites a PM's edit or a later update.
 */
export async function rereadBriefAttributesAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return { message: "Project not found." };
  }

  const { error } = await fillKeyAttributeGapsFromProjectSources(projectId);
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
 * What the capability-assessment and estimate-brief agents reason from: the
 * shared project context (brief, every update, key details, PM perspective —
 * see getProjectContext) plus the Position Document's other details. Returns
 * the brief version it reflects, for the output to record.
 */
async function assembleCapabilityBriefContext(
  projectId: string
): Promise<{ text: string; builtFromVersion: number }> {
  const [context, positionDocument] = await Promise.all([
    getProjectContext(projectId),
    latestPositionDocumentContent(projectId),
  ]);
  const sections = [context.text];
  if (positionDocument) {
    sections.push(`## Position Document (other details from the brief)\n${JSON.stringify(positionDocument)}`);
  }
  return { text: sections.join("\n\n"), builtFromVersion: context.latestVersion };
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
    const assessment = await assessCapabilities(briefContext.text);
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
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, currentStageNumber: true },
    }),
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
    content = await generateEstimateBriefContent(briefContext.text, capabilities);
  } catch (error) {
    if (error instanceof EstimateBriefAgentError) {
      return { message: error.message };
    }
    throw error;
  }

  const fileBytes = new Uint8Array(
    await renderEstimateBriefDocx(content, timelineSection(await getBriefCompleteness(projectId)))
  );

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
          builtFromVersion: briefContext.builtFromVersion,
          createdById: session?.user?.id,
        },
      });
    } else {
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
              builtFromVersion: briefContext.builtFromVersion,
              createdById: session?.user?.id,
            },
          },
        },
      });
    }

    // Preparing the Estimate Brief completes Phase 1 and opens specialist
    // review — once: a project already at Stage 5 or beyond is left as is.
    if (project.currentStageNumber < 5) {
      await completePhase1(tx, projectId);
    }
  });

  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// PM perspective
// ---------------------------------------------------------------------------

/**
 * Edits one PM perspective field after intake. Records who edited it and
 * when (per field). Doesn't touch documents already generated (update propagation is a
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

// ---------------------------------------------------------------------------
// Regenerating stale outputs (each a new version; earlier versions untouched)
// ---------------------------------------------------------------------------

/** A new draft of the client clarification email from the latest context. Never sent. */
export async function regenerateClarificationEmailAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  try {
    await redraftClarificationEmail(projectId, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof IntakeAgentError) {
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(`/projects/${projectId}`);
}

/** Rebuilds the Position Document from the brief and every update. */
export async function regeneratePositionDocumentAction(
  projectId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  try {
    await rebuildPositionDocumentVersion(projectId, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof ClarificationExtractionError) {
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// SOW ↔ estimate sync
// ---------------------------------------------------------------------------

/**
 * For a SOW version whose source estimate isn't known (made before the link
 * existed, and not linked by the backfill): the PM says which estimate
 * version it reflects. Records the link and a snapshot of that version; the
 * SOW's content isn't touched. Never re-points a version that already has a
 * source, and only accepts this project's estimate versions.
 */
export async function confirmSowEstimateSourceAction(
  projectId: string,
  sowVersionId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const estimateVersionId = formData.get("estimateVersionId");
  if (typeof estimateVersionId !== "string" || !estimateVersionId) {
    return { message: "Choose the estimate version this SOW reflects." };
  }

  const [sowVersion, estimateVersion] = await Promise.all([
    prisma.sOWVersion.findFirst({
      where: { id: sowVersionId, sow: { projectId } },
      select: { sourceEstimateVersionId: true },
    }),
    prisma.estimateVersion.findFirst({
      where: { id: estimateVersionId, estimate: { projectId } },
      select: { id: true, totalValue: true, currency: true, capabilitiesIncluded: true },
    }),
  ]);
  if (!sowVersion) {
    return { message: "SOW version not found." };
  }
  if (sowVersion.sourceEstimateVersionId) {
    return { message: "This SOW version already records the estimate version it came from." };
  }
  if (!estimateVersion) {
    return { message: "Estimate version not found on this project." };
  }

  await prisma.sOWVersion.update({
    where: { id: sowVersionId },
    data: {
      sourceEstimateVersionId: estimateVersion.id,
      sourceEstimateTotal: estimateVersion.totalValue,
      sourceEstimateCurrency: estimateVersion.currency,
      sourceEstimateCapabilities: estimateVersion.capabilitiesIncluded,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * "Update SOW": a NEW SOW version from the current version of the estimate
 * the SOW is pinned to — never an overwrite (a SOW is a commercial/legal
 * document). Only the estimate-derived section is refreshed: the commercials
 * (and the prepared date). The authored narrative — scope, deliverables,
 * services, assumptions, exclusions, risks — is carried forward unchanged
 * from the previous version, with no AI call, so nothing in it can shift.
 * Only offered for the latest SOW version, and only when it's stale
 * (getSowSyncStatus).
 */
export async function updateSowFromEstimateAction(
  projectId: string,
  sowVersionId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const sync = await getSowSyncStatus(projectId);
  if (!sync.sow) {
    return { message: "There's no SOW to update yet." };
  }
  if (sync.sow.sowVersionId !== sowVersionId) {
    return { message: "A newer SOW version exists — update from that one." };
  }
  if (sync.sow.status === "unlinked" || !sync.sow.current) {
    return {
      message: "We don't know which estimate this SOW came from — confirm it first, or regenerate the SOW.",
    };
  }
  if (sync.sow.status === "in_sync") {
    return { message: "This SOW is already up to date with its estimate." };
  }

  const [project, previous, estimateVersion] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } }),
    prisma.sOWVersion.findUniqueOrThrow({
      where: { id: sowVersionId },
      select: {
        content: true,
        sowTemplateId: true,
        sowTemplateVersionId: true,
        builtFromVersion: true,
        itemsSnapshot: true,
      },
    }),
    prisma.estimateVersion.findFirstOrThrow({
      where: { id: sync.sow.current.estimateVersionId, estimate: { projectId } },
      select: {
        id: true,
        totalValue: true,
        currency: true,
        description: true,
        needsRecalculation: true,
        capabilitiesIncluded: true,
      },
    }),
  ]);
  const previousContent = previous.content as Partial<SOWContent> | null;
  if (!previousContent?.body || !previousContent.coverDetails) {
    return { message: "This SOW version can't be updated in place — regenerate the SOW instead." };
  }

  const content: SOWContent = {
    body: previousContent.body,
    coverDetails: {
      ...previousContent.coverDetails,
      preparedDate: formatSowDate(new Date()),
      commercials: {
        totalValue: Number(estimateVersion.totalValue),
        currency: estimateVersion.currency,
        description: estimateVersion.description,
        needsRecalculation: estimateVersion.needsRecalculation,
      },
    },
  };
  const fileBytes = new Uint8Array(await renderSowDocx(content));
  const session = await auth();

  await prisma.$transaction(async (tx) => {
    const sow = await tx.sOW.findUniqueOrThrow({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    const versionNumber = (sow.versions[0]?.versionNumber ?? 0) + 1;
    await tx.sOWVersion.create({
      data: {
        sowId: sow.id,
        versionNumber,
        fileName: `SOW - ${project.name} - v${versionNumber}.docx`,
        fileBytes,
        content: content as unknown as Prisma.InputJsonValue,
        sowTemplateId: previous.sowTemplateId,
        sowTemplateVersionId: previous.sowTemplateVersionId,
        // The narrative is unchanged, so it reflects the same brief version
        // and the same validated item set.
        builtFromVersion: previous.builtFromVersion,
        itemsSnapshot: previous.itemsSnapshot ?? Prisma.JsonNull,
        sourceEstimateVersionId: estimateVersion.id,
        sourceEstimateTotal: estimateVersion.totalValue,
        sourceEstimateCurrency: estimateVersion.currency,
        sourceEstimateCapabilities: estimateVersion.capabilitiesIncluded,
        createdById: session?.user?.id,
      },
    });
  });

  revalidatePath(`/projects/${projectId}`);
}
