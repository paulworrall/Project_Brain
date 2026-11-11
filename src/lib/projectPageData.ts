import { cache } from "react";
import { getVersionHistory } from "@/lib/updateVersions";
import { getSowChangeStatus } from "@/lib/sowChangeStatus";
import { prisma } from "@/lib/prisma";
import { getSOWTemplatesForClientAction } from "@/app/(dashboard)/sow-templates/actions";
import { getRateCardsForWorkstreamAction } from "@/app/(dashboard)/projects/new/actions";
import {
  ClarificationEmailSchema,
  PositionDocumentFieldsSchema,
} from "@/types/intake";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";
import { getBriefCompleteness } from "@/lib/briefCompleteness";
import { getPmPerspective } from "@/lib/pmPerspectiveStore";
import { auth } from "@/lib/auth";
import { canApprove, canRevertApproval } from "@/lib/permissions";
import {
  approvalViewFor,
  getProjectApprovals,
  stageStatusWithApprovals,
} from "@/lib/commercial/approvalViewData";
import { sowApprovalBlockedReason } from "@/lib/commercial/sowApprovalGate";
import {
  buildStepSummaries,
  deriveStepStatuses,
  getCurrentStepId,
  isProjectComplete,
} from "@/lib/projectSteps";
import { buildSpecialistRows, buildSystemChecks } from "@/lib/project/readiness";
import { latestScopeSummary, scopeSummaryVersion } from "@/lib/scopeSummary";
import { buildScopeView, openQuestionCount } from "@/lib/scopeSummaryView";
import { DraftScopeDocumentSchema } from "@/types/triage";

async function fetchProjectPageData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workstream: {
        include: {
          client: {
            include: {
              hub: true,
              rateCards: {
                // Existence is "has at least one version at all," not "has
                // an ENABLED one" — status is no longer a selectability gate
                // for Rate Cards (Rule 3 audit gap fix), and archived Rate
                // Cards are excluded — same pattern as
                // getRateCardsForWorkstreamAction, not relying on the
                // invariant that some version is always ENABLED.
                where: { archivedAt: null, versions: { some: {} } },
                orderBy: { name: "asc" },
              },
            },
          },
        },
      },
      rateCard: true,
      rateCardVersion: true,
      sowTemplate: true,
      sowTemplateVersion: true,
      documents: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      checklistItems: {
        orderBy: { order: "asc" },
      },
      touchpointNotes: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: true },
      },
      capabilities: true,
      estimateBrief: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      estimates: {
        orderBy: { createdAt: "desc" },
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
        },
      },
      sow: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            include: { sourceEstimateVersion: { select: { versionNumber: true } } },
          },
        },
      },
      projectManager: true,
      specialistInputs: true,
      scopeConfirmedBy: { select: { id: true, name: true } },
    },
  });

  if (!project) {
    return null;
  }

  const {
    workstream,
    documents,
    checklistItems,
    touchpointNotes,
    capabilities,
    estimateBrief,
    estimates,
    sow,
  } = project;
  const { client } = workstream;
  const { hub } = client;

  const [stages, projectManagerOptions, sowTemplateOptions, rateCardOptions] = await Promise.all([
    prisma.stage.findMany({
      orderBy: { number: "asc" },
      include: {
        stageStatuses: {
          where: { projectId },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "DELIVERY" },
      orderBy: { name: "asc" },
    }),
    getSOWTemplatesForClientAction(client.id),
    getRateCardsForWorkstreamAction(workstream.id),
  ]);

  const clarificationEmailVersion = documents.find((d) => d.type === "CLARIFICATION_EMAIL")?.versions[0];
  const clarificationEmailContent = clarificationEmailVersion?.content;
  const positionDocumentContent = documents.find(
    (d) => d.type === "POSITION_DOCUMENT"
  )?.versions[0]?.content;
  const deliverablesServicesDocumentContent = documents.find(
    (d) => d.type === "DELIVERABLES_SERVICES_DOCUMENT"
  )?.versions[0]?.content;

  const clarificationEmail = ClarificationEmailSchema.safeParse(clarificationEmailContent);
  const positionDocument = PositionDocumentFieldsSchema.safeParse(positionDocumentContent);
  const deliverablesServicesDocument = DeliverablesServicesDocumentSchema.safeParse(
    deliverablesServicesDocumentContent
  );

  const specialistFeedbackNote = touchpointNotes.find((n) => n.type === "SPECIALIST_REVIEW");
  const specialistFeedback = specialistFeedbackNote
    ? {
        content: specialistFeedbackNote.content,
        capability: specialistFeedbackNote.capability,
        otherCapabilityLabel: specialistFeedbackNote.otherCapabilityLabel,
      }
    : null;

  const [session, approvals] = await Promise.all([auth(), getProjectApprovals(prisma, projectId)]);
  const actor = session?.user ? { id: session.user.id, role: session.user.role } : null;
  // Booleans only — role logic never reaches the client.
  const permissions = { canApprove: canApprove(actor), canRevert: canRevertApproval(actor) };

  // Stages 6 and 8 read Complete while their document is approved (computed on
  // read — see stageStatusWithApprovals — so reverting restores them).
  const stageStatuses = stages.map((stage) =>
    stageStatusWithApprovals(
      stage.number,
      stage.stageStatuses[0]?.status ?? "NOT_STARTED",
      approvals.summary
    )
  );

  // FB-009: the Scope summary (latest + the confirmed version's number) and,
  // for projects created before it, their earlier documents (read-only).
  const [scopeLatest, scopeConfirmed] = await Promise.all([
    latestScopeSummary(project.id),
    project.confirmedScopeVersionId ? scopeSummaryVersion(project.id, project.confirmedScopeVersionId) : null,
  ]);
  const draftScopeDocument = DraftScopeDocumentSchema.safeParse(
    documents.find((d) => d.type === "DRAFT_SCOPE_DOCUMENT")?.versions[0]?.content
  );

  const [briefCompleteness, pmPerspective, versionHistory] = await Promise.all([
    getBriefCompleteness(project.id),
    getPmPerspective(project.id),
    getVersionHistory(project.id),
  ]);
  const sowChange = await getSowChangeStatus(project.id);
  // Every update since the brief (v2 onwards), for Phase 1's progress count.
  const clientUpdates = versionHistory.slice(1).map((v) => ({
    id: v.id,
    content: v.content,
    createdAt: v.createdAt,
    createdByName: null,
  }));

  const confirmedCapabilities = capabilities.map((c) => c.capability);
  const latestEstimateBriefVersion = estimateBrief?.versions[0] ?? null;
  const estimateBriefVersion = latestEstimateBriefVersion
    ? {
        id: latestEstimateBriefVersion.id,
        versionNumber: latestEstimateBriefVersion.versionNumber,
        createdAt: latestEstimateBriefVersion.createdAt,
        capabilities: latestEstimateBriefVersion.capabilities,
      }
    : null;

  // FB-008: the SOW journey's three steps, derived on read.
  const sowVersions = sow?.versions ?? [];
  const stepStatuses = deriveStepStatuses({
    scopeConfirmedAt: project.scopeConfirmedAt,
    hasApprovedEstimate: approvals.summary.estimate !== null,
    hasEstimateWork: estimates.length > 0 || latestEstimateBriefVersion !== null || project.specialistInputs.length > 0,
    hasApprovedSow: approvals.summary.sow !== null,
    hasSowVersion: sowVersions.length > 0,
  });
  const currentStepId = getCurrentStepId(stepStatuses);
  const projectComplete = isProjectComplete(stepStatuses);
  // The header status: "Complete — SOW approved" once the SOW is client approved.
  const projectStatus: "COMPLETE" | "ACTIVE" = projectComplete ? "COMPLETE" : "ACTIVE";
  const stepSummaries = buildStepSummaries({
    scopeConfirmedAt: project.scopeConfirmedAt,
    approvedEstimate: approvals.summary.estimate
      ? { ...approvals.summary.estimate, clientApprovedOn: approvals.summary.estimate.approval.clientApprovedOn }
      : null,
    approvedSow: approvals.summary.sow
      ? { ...approvals.summary.sow, clientApprovedOn: approvals.summary.sow.approval.clientApprovedOn }
      : null,
  });
  const systemChecks = buildSystemChecks({
    // v1 of the version history is the brief (empty if none was submitted).
    briefSubmitted: !!versionHistory.find((v) => v.id === "brief")?.content.trim(),
    hasMasterServiceAgreement: project.masterServiceAgreementId !== null,
    hasRateCard: project.rateCardId !== null,
    scopeConfirmed: project.scopeConfirmedAt !== null,
    confirmedCapabilityCount: confirmedCapabilities.length,
    estimateApproved: approvals.summary.estimate !== null,
    sowFromApprovedEstimate:
      approvals.approvedEstimateVersionId !== null &&
      sowVersions[0]?.sourceEstimateVersionId === approvals.approvedEstimateVersionId,
  });
  const specialistRows = buildSpecialistRows(
    confirmedCapabilities,
    project.specialistInputs.map((i) => ({ capability: i.capability, status: i.status, note: i.note }))
  );

  const scopeSummary = scopeLatest
    ? {
        versionId: scopeLatest.id,
        versionNumber: scopeLatest.versionNumber,
        createdAt: scopeLatest.createdAt,
        content: scopeLatest.content,
        sections: buildScopeView(scopeLatest.content, briefCompleteness),
        confirmedVersionNumber: scopeConfirmed?.versionNumber ?? null,
      }
    : null;
  const openQuestions = openQuestionCount(scopeLatest?.content ?? null, briefCompleteness);
  const earlierDocuments = {
    positionDocument: positionDocument.success ? positionDocument.data : null,
    draftScopeDocument: draftScopeDocument.success ? draftScopeDocument.data : null,
  };

  return {
    scopeSummary,
    openQuestions,
    earlierDocuments,
    project,
    workstream,
    client,
    hub,
    documents,
    checklistItems,
    capabilities,
    estimateBrief,
    estimates,
    sow,
    stages,
    stageStatuses,
    projectStatus,
    projectManagerOptions,
    sowTemplateOptions,
    rateCardOptions,
    clarificationEmail,
    positionDocument,
    deliverablesServicesDocument,
    clarificationEmailVersion,
    specialistFeedback,
    permissions,
    approvals,
    briefCompleteness,
    pmPerspective,
    versionHistory,
    sowChange,
    clientUpdates,
    confirmedCapabilities,
    estimateBriefVersion,
    stepStatuses,
    stepSummaries,
    currentStepId,
    projectComplete,
    systemChecks,
    specialistRows,
  };
}

/**
 * Everything the project page needs, loaded once per request. `cache` lets the
 * project layout (shell + Discover) and the pages beneath it (the redirect to
 * the current phase) share a single set of queries instead of repeating them.
 * Null when the project doesn't exist.
 */
export const loadProjectPageData = cache(async (projectId: string) => {
  return fetchProjectPageData(projectId);
});
