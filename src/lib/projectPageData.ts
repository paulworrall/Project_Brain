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

import { deriveProjectPhaseStatuses } from "@/lib/projectPhases";
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
  const projectStatus: "COMPLETE" | "ACTIVE" = stageStatuses.every((status) => status === "COMPLETE")
    ? "COMPLETE"
    : "ACTIVE";

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

  const phaseStatuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: approvals.summary.sow !== null });

  return {
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
    phaseStatuses,
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
