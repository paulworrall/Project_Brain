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
import {
  rebuildPositionDocumentVersion,
  redraftClarificationEmail,
} from "@/lib/outputRegeneration";
import { IntakeAgentError } from "@/services/agents/intake-agent";
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
import { assembleSowContext } from "@/lib/sow-context";
import { snapshotMaterialKeyDetails } from "@/lib/sowChangeStatus";
import { checkSowPreconditions } from "@/lib/sowPreconditions";
import { completeSowReview, listSowItems, validatedListsFromItems } from "@/lib/sowItems";
import { snapshotItems } from "@/lib/sowReview";
import type { SOWContent, SOWDocumentContent } from "@/types/sow";
import type { Capability, ProjectInfoCategory, UpdateSource } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import {
  BRIEF_ATTRIBUTES,
  getBriefAttribute,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
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
import {
  ProjectCompleteError,
  assertProjectEditable,
  isProjectCompleteInDb,
  projectCompleteMessage,
} from "@/lib/project/projectGuards";
import { extractUploadText } from "@/services/parsing/brief";
import { INFO_ERRORS, INFO_RULES } from "@/lib/projectInfoFileRules";
import { canEditProject, CANNOT_EDIT_PROJECT_MESSAGE } from "@/lib/permissions";
import { appendScopeSummaryVersion, latestScopeSummary, scopeInputSection } from "@/lib/scopeSummary";
import { ScopeSummaryAgentError, updateScopeSummary } from "@/services/agents/scope-summary-agent";
import type { ScopeSummaryContent } from "@/types/scope";
import { PROJECT_COMPLETE_MESSAGE } from "@/lib/projectSteps";
import {
  AssistantClassifierError,
  classifyAssistantMessage,
  type AssistantIntent,
} from "@/services/agents/assistant-classifier";
import type { ActionResult } from "@/types/approvals";
import {
  CommercialLockedError,
  assertSowEditable,
  lockMessage,
} from "@/lib/commercial/approvalGuards";

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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
    const mapping = Object.entries(attribute.projectDateFields ?? {}).flatMap(
      ([subFieldId, column]) => (column ? [[subFieldId, column] as const] : [])
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
  sowTemplateVersionId: z
    .string()
    .trim()
    .min(1, { error: "Select a version of the chosen template." }),
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
      message:
        errors.sowTemplateId?.[0] ?? errors.sowTemplateVersionId?.[0] ?? "Select a SOW Template.",
    };
  }

  const lockedTemplate = await lockMessage("SOW", projectId);
  if (lockedTemplate) return { message: lockedTemplate };

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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

  const lockedBefore = await lockMessage("SOW", projectId);
  if (lockedBefore) return { message: lockedBefore };

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
  // What the SOW is built from, recorded now so later updates can be compared
  // against it (the "Updates since this SOW was generated" notice).
  const keyAttributesSnapshot = await snapshotMaterialKeyDetails(projectId);
  // Every new SOW records the exact estimate version its commercials came from.
  if (!sourceEstimate) {
    return {
      message:
        "Save an estimate version before generating the SOW — its fees come from the estimate.",
    };
  }

  // The SOW is composed ONLY from the items the PM validated (SowSectionItem):
  // included, non-blank, in position order. Deliverables is required.
  const items = await listSowItems(projectId);
  const validated = validatedListsFromItems(items);
  if (validated.deliverables.length === 0) {
    return {
      message: "Review the SOW content first — include at least one deliverable before generating.",
    };
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

  try {
    await prisma.$transaction(async (tx) => {
      // Re-checked here, after the (slow) agent call: an approval that landed
      // during generation must not be overwritten by this new version.
      await assertSowEditable(projectId, tx);
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
        keyAttributesSnapshot: keyAttributesSnapshot as unknown as Prisma.InputJsonValue,
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
  } catch (error) {
    if (error instanceof CommercialLockedError) return { message: error.message };
    throw error;
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
    error: 'Name the capability team when selecting "Other".',
    path: ["otherLabel"],
  });

/**
 * The pre-FB-008 Specialist consultation submit. Since FB-008 there is no UI
 * for it (the Estimate step's specialist input tracker replaced it); kept so
 * the stored notes and Deliverables + Services Document keep their writer and
 * tests, and guarded like every other mutation.
 */
export async function submitSpecialistFeedbackAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

  const parsed = FeedbackSchema.safeParse({
    feedback: formData.get("feedback"),
    capability: formData.get("capability"),
    otherLabel: formData.get("otherLabel") || undefined,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      message:
        errors.feedback?.[0] ??
        errors.capability?.[0] ??
        errors.otherLabel?.[0] ??
        "Invalid feedback.",
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
    return { message: "Prepare the Estimate Brief in Step 1 before adding specialist feedback." };
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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
}

export async function toggleChecklistItemAction(
  projectId: string,
  itemId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

  const isComplete = formData.get("isComplete") === "on";

  const result = await prisma.checklistItem.updateMany({
    where: { id: itemId, projectId },
    data: { isComplete, completedAt: isComplete ? new Date() : null },
  });

  if (result.count === 0) {
    return { message: "Checklist item not found." };
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
}

const OtherLabelSchema = z.object({
  otherLabel: z.string().trim().min(1, { error: "Label can't be empty." }),
});

export async function updateOtherServiceLabelAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
interface ProjectUpdateInput {
  content: string;
  type: "DOCUMENT" | "NOTE";
  originalFileName: string | null;
  source: UpdateSource;
  userId: string | undefined;
  /** FB-010: what kind of information it is (null when typed into the assistant). */
  category?: ProjectInfoCategory | null;
  /** FB-010: the day it happened (e.g. the meeting date). */
  occurredOn?: Date | null;
  /**
   * FB-010: whether to queue the automatic clarification email redraft. A
   * batch of files redrafts once, after its last file. Default true.
   */
  redraftEmail?: boolean;
}

interface SavedProjectUpdate {
  versionNumber: number;
  /** What the update changed, in words: key detail labels, plus "position document". */
  changed: string[];
  /** Saved, with something the user should know. */
  notice: string;
}

/**
 * The Keep-This-Project-Up-to-Date flow, shared by uploadKnowledgeItemAction
 * and the Project assistant (FB-008): saves the update as the next brief
 * version, refreshes the Position Document and key details from it, then
 * (after the response) summarises it and redrafts the client email.
 * Not exported — a "use server" export would be callable from the client.
 */
async function saveProjectUpdate(projectId: string, input: ProjectUpdateInput): Promise<SavedProjectUpdate> {
  const { content } = input;
  // FB-009: a project with a Scope summary gets a new Scope summary version
  // from the update instead of a new Position Document version.
  const scopeSummary = await latestScopeSummary(projectId);
  let scopeUpdate: { content: ScopeSummaryContent; changedSections: string[] } | null = null;
  let scopeNotice: string | undefined;
  if (scopeSummary) {
    try {
      const context = await getProjectContext(projectId);
      scopeUpdate = await updateScopeSummary(scopeSummary.content, content, context.text, context.pmPerspective);
    } catch (error) {
      if (!(error instanceof ScopeSummaryAgentError)) throw error;
      console.error("Scope summary update failed:", error);
      scopeNotice = `Update saved, but the scope summary couldn't be updated from it this time (${error.message}).`;
    }
  }
  const positionDocument = scopeSummary
    ? null
    : await prisma.document.findUnique({
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
    const knownKeyDetails = describeKnownKeyDetails(
      await getBriefCompleteness(projectId),
      keyAttributes
    );
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
        type: input.type,
        content,
        originalFileName: input.originalFileName,
        source: input.source,
        category: input.category ?? null,
        occurredOn: input.occurredOn ?? null,
        versionNumber: await nextUpdateVersion(tx, projectId),
        uploadedById: input.userId,
      },
    });

    if (scopeUpdate && scopeUpdate.changedSections.length > 0) {
      await appendScopeSummaryVersion(
        projectId,
        scopeUpdate.content,
        { builtFromVersion: item.versionNumber, userId: input.userId ?? null, triggeredByUpdateVersion: item.versionNumber },
        tx
      );
    }

    // The update itself is the record; no separate client-reply copy is kept.
    if (updatedFields && positionDocument && latestVersion) {
      await tx.documentVersion.create({
        data: {
          documentId: positionDocument.id,
          versionNumber: latestVersion.versionNumber + 1,
          stageNumber: 3,
          content: updatedFields,
          builtFromVersion: item.versionNumber,
          createdById: input.userId,
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
  // FB-009: once the PM has marked the email as sent, drafts stop being
  // rewritten automatically (they can still redraft it by hand).
  const { clarificationSentAt } = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { clarificationSentAt: true },
  });
  const redraft = !clarificationSentAt && input.redraftEmail !== false;
  if (redraft) {
    runAfterResponse(async () => {
      try {
        await redraftClarificationEmail(projectId, null, knowledgeItem.versionNumber);
      } catch (error) {
        console.error("Clarification email redraft after an update failed:", error);
      }
    });
  }

  const changedScope = scopeUpdate?.changedSections ?? [];
  const changed = [
    ...Object.keys(keyAttributes ?? {}).map((id) => (getBriefAttribute(id)?.label ?? id).toLowerCase()),
    ...(updatedFields ? ["position document"] : []),
    ...(changedScope.length > 0 ? [`scope summary (${changedScope.join(", ")})`] : []),
  ];
  const savedNotice = `Saved as v${knowledgeItem.versionNumber}.`;
  const draftNotice = !redraft
    ? savedNotice
    : `${savedNotice} A fresh client email draft is being written from it — refresh in a moment to see it.`;
  const problem = scopeNotice ?? positionDocumentNotice;
  return {
    versionNumber: knowledgeItem.versionNumber!,
    changed,
    notice: problem ? `${problem} ${draftNotice}` : draftNotice,
  };
}

// ---------------------------------------------------------------------------
// FB-010: Add project information — the sidebar panel for meeting notes,
// client clarifications, presentations and documents. One call saves one
// version (pasted text, or one file): the panel sends several files one call
// each, in order, so every request stays under the 10 MB server action limit.
// ---------------------------------------------------------------------------

export interface ProjectInformationResult {
  projectId: string;
  versionNumber: number;
  /** The file this version came from (null for pasted text). */
  fileName: string | null;
  /** "Added as v3 · Updated: budget, scope summary (Deliverables)". */
  confirmation: string;
  /** Extra detail (the email redraft, or a scope summary that couldn't be refreshed). */
  notice: string;
}

const ProjectInformationSchema = z.object({
  category: z.enum(["MEETING_NOTES", "CLIENT_CLARIFICATION", "PRESENTATION_OR_DOCUMENT", "OTHER"], {
    error: "Choose what kind of information this is.",
  }),
  source: z.enum(["CLIENT", "INTERNAL_TEAM"], { error: "Choose who this is from." }).default("CLIENT"),
  occurredOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Enter the date it happened." })
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), { error: "Enter a valid date." })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  content: z.string().trim().max(200_000, { error: "That's too long to paste. Add it as a file instead." }).default(""),
  /** "false" for every file but the last in a batch: the email is redrafted once, at the end. */
  finalInBatch: z.enum(["true", "false"]).default("true"),
});

function informationFailure(
  message: string,
  code: "VALIDATION" | "FORBIDDEN" | "PROJECT_COMPLETE" | "NOT_FOUND" = "VALIDATION",
  fieldErrors?: Record<string, string>
): ActionResult<ProjectInformationResult> {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

export async function addProjectInformationAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<ProjectInformationResult>> {
  const parsed = ProjectInformationSchema.safeParse({
    category: formData.get("category") ?? undefined,
    source: formData.get("source") || undefined,
    occurredOn: formData.get("occurredOn") ?? undefined,
    content: formData.get("content") ?? undefined,
    finalInBatch: formData.get("finalInBatch") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return informationFailure(parsed.error.issues[0]?.message ?? "Check the form.", "VALIDATION", fieldErrors);
  }
  const { category, source, occurredOn, content: pasted, finalInBatch } = parsed.data;

  const session = await auth();
  const actor = session?.user ? { id: session.user.id, role: session.user.role } : null;
  if (!canEditProject(actor)) return informationFailure(CANNOT_EDIT_PROJECT_MESSAGE, "FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return informationFailure("Project not found.", "NOT_FOUND");
  try {
    await assertProjectEditable(projectId);
  } catch (error) {
    if (error instanceof ProjectCompleteError) return informationFailure(error.message, "PROJECT_COMPLETE");
    throw error;
  }

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !pasted) {
    // A zero-byte file arrives as an empty File.
    return informationFailure(
      file instanceof File && file.name ? INFO_ERRORS.noText : "Paste some text or add a file."
    );
  }
  if (hasFile && pasted) return informationFailure("Add either pasted text or a file, not both.");

  let content = pasted;
  let fileName: string | null = null;
  if (hasFile && file instanceof File) {
    fileName = file.name;
    const read = await extractUploadText(
      { name: file.name, size: file.size, type: file.type },
      Buffer.from(await file.arrayBuffer()),
      INFO_RULES
    );
    if (!read.ok) return informationFailure(read.error, "VALIDATION", { file: read.error });
    content = read.text;
  }

  const saved = await saveProjectUpdate(projectId, {
    content,
    type: hasFile ? "DOCUMENT" : "NOTE",
    originalFileName: fileName,
    source,
    userId: actor!.id,
    category,
    occurredOn: occurredOn ? new Date(`${occurredOn}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10)),
    redraftEmail: finalInBatch === "true",
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
  const changed = [...new Set(saved.changed)];
  return {
    ok: true,
    data: {
      projectId,
      versionNumber: saved.versionNumber,
      fileName,
      confirmation: `Added as v${saved.versionNumber}${changed.length > 0 ? ` · Updated: ${changed.join(", ")}` : " · Nothing in the key details or scope changed"}`,
      notice: saved.notice,
    },
  };
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    return { message: "Project not found." };
  }

  const { error } = await fillKeyAttributeGapsFromProjectSources(projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
  if (error) {
    return { message: error };
  }
}

// ---------------------------------------------------------------------------
// Project assistant (FB-008): one input for questions and updates. A message
// is classified first (the only new agent call), then routed to the existing
// flows — answerProjectQuestion for questions, saveProjectUpdate for updates.
// ---------------------------------------------------------------------------

export interface AssistantReply {
  /** What happened, for the UI. "choose" = ask the user which they meant. */
  kind: "answer" | "updated" | "answer_and_updated" | "choose" | "declined" | "answer_and_declined";
  answer?: string;
  /** "Updated: timeline, budget constraint" — or that nothing new was found. */
  confirmation?: string;
  /** Extra detail about the saved update (version number, email redraft). */
  notice?: string;
  /** Why an update wasn't made (the project is complete). */
  declined?: string;
}

const AssistantMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .max(20_000, { error: "That message is too long. Add it under Add project information instead." }),
  mode: z.enum(["auto", "question", "update"]).default("auto"),
});

function assistantFailure(message: string): ActionResult<AssistantReply> {
  return { ok: false, code: "VALIDATION", message };
}

/** Turns the update's changed labels into the assistant's confirmation line. */
function describeUpdateConfirmation(changed: string[]): string {
  const unique = [...new Set(changed)];
  return unique.length > 0 ? `Updated: ${unique.join(", ")}` : "Saved. Nothing in the key details or position changed.";
}

export async function sendAssistantMessageAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<AssistantReply>> {
  const parsed = AssistantMessageSchema.safeParse({
    message: formData.get("message") ?? "",
    mode: formData.get("mode") || undefined,
  });
  if (!parsed.success) {
    return assistantFailure(parsed.error.issues[0]?.message ?? "Invalid message.");
  }
  const { message, mode } = parsed.data;
  if (!message) {
    return assistantFailure("Type a message first.");
  }

  let intent: AssistantIntent;
  if (mode === "question") {
    intent = { intent: "question", question: message, update: null };
  } else if (mode === "update") {
    intent = { intent: "update", question: null, update: message };
  } else {
    try {
      intent = await classifyAssistantMessage(message);
    } catch (error) {
      if (error instanceof AssistantClassifierError) return assistantFailure(error.message);
      throw error;
    }
  }

  if (intent.intent === "unclear") {
    return { ok: true, data: { kind: "choose" } };
  }

  const reply: AssistantReply = { kind: "answer" };
  const wantsUpdate = intent.intent === "update" || intent.intent === "both";
  const wantsAnswer = intent.intent === "question" || intent.intent === "both";
  let updated = false;
  let declined = false;

  // The update runs first, so a question asked alongside it is answered from
  // the newly recorded information.
  if (wantsUpdate) {
    if (await isProjectCompleteInDb(projectId)) {
      declined = true;
      reply.declined = PROJECT_COMPLETE_MESSAGE;
    } else {
      const session = await auth();
      const actor = session?.user ? { id: session.user.id, role: session.user.role } : null;
      if (!canEditProject(actor)) {
        return { ok: false, code: "FORBIDDEN", message: CANNOT_EDIT_PROJECT_MESSAGE };
      }
      // FB-010: typed updates are notes from the client side by default; the
      // Add project information panel is where the source and type are set.
      const saved = await saveProjectUpdate(projectId, {
        content: intent.update ?? message,
        type: "NOTE",
        originalFileName: null,
        source: "CLIENT",
        userId: actor?.id,
      });
      updated = true;
      reply.confirmation = describeUpdateConfirmation(saved.changed);
      reply.notice = saved.notice;
      revalidatePath(`/projects/${projectId}`, "layout");
      revalidatePath("/"); // FB-009 F: the pipeline home page
    }
  }

  if (wantsAnswer) {
    try {
      reply.answer = await answerProjectQuestion(projectId, intent.question ?? message);
    } catch (error) {
      if (!(error instanceof ChatbotError)) throw error;
      // An update that was saved stays saved; say the answer failed.
      if (!updated) return assistantFailure(error.message);
      reply.answer = error.message;
    }
  }

  reply.kind = wantsAnswer
    ? updated
      ? "answer_and_updated"
      : declined
        ? "answer_and_declined"
        : "answer"
    : updated
      ? "updated"
      : "declined";
  return { ok: true, data: reply };
}

// ---------------------------------------------------------------------------
// End-of-Phase-1: Capabilities & Estimate Brief. Additive — never gates
// Stage 2. See CLAUDE.md's Data Flow section and prisma/schema.prisma's
// Capability/ProjectCapability/EstimateBrief models.
// ---------------------------------------------------------------------------

/**
 * What the capability-assessment and estimate-brief agents reason from: the
 * shared project context (brief, every update, key details, PM perspective —
 * see getProjectContext) plus the scope input (FB-009: the confirmed Scope
 * summary; else the latest one; else a legacy project's Position Document —
 * see scopeInputSection). Returns the brief version it reflects.
 */
async function assembleCapabilityBriefContext(
  projectId: string
): Promise<{ text: string; builtFromVersion: number }> {
  const [context, scope] = await Promise.all([getProjectContext(projectId), scopeInputSection(projectId)]);
  const sections = [context.text];
  if (scope) sections.push(scope);
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
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
  const completeLock = await projectCompleteMessage(projectId);
  if (completeLock) {
    return { message: completeLock };
  }

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
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/"); // FB-009 F: the pipeline home page
}
