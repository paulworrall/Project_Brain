import { getVersionHistory } from "@/lib/updateVersions";
import { getSowChangeStatus } from "@/lib/sowChangeStatus";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectWorkflow } from "@/components/features/ProjectWorkflow";
import { ProjectSummaryBar } from "@/components/features/ProjectSummaryBar";
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

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

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
    notFound();
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
  const projectStatus = stageStatuses.every((status) => status === "COMPLETE") ? "COMPLETE" : "ACTIVE";

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:underline">
              {hub.name}
            </Link>
            {" / "}
            <Link href={`/clients/${client.id}`} className="hover:underline">
              {client.name}
            </Link>
            {" / "}
            <Link href={`/workstreams/${workstream.id}`} className="hover:underline">
              {workstream.name}
            </Link>
          </nav>
          <h1 className="mt-1 text-xl font-semibold text-foreground">{project.name}</h1>
        </div>
        <Link
          href={`/projects/${project.id}/outputs`}
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Outputs Library →
        </Link>
      </div>

      <ProjectSummaryBar
        projectId={project.id}
        status={projectStatus}
        jobCode={project.jobCode}
        kickOffDate={project.kickOffDate}
        targetCompletionDate={project.targetCompletionDate}
        projectManager={project.projectManager}
        projectManagerOptions={projectManagerOptions}
        rateCard={
          project.rateCard
            ? { id: project.rateCard.id, name: project.rateCard.name, currency: project.rateCard.currency }
            : null
        }
        rateCardOptions={client.rateCards.map((rc) => ({
          id: rc.id,
          name: rc.name,
          currency: rc.currency,
        }))}
      />

      <ProjectWorkflow
        projectId={project.id}
        projectName={project.name}
        stages={stages.map((stage, index) => ({
          stageNumber: stage.number,
          name: stage.name,
          status: stageStatuses[index],
        }))}
        approvedDocuments={approvals.summary}
        approvalPermissions={permissions}
        estimateLock={
          approvals.summary.estimate
            ? {
                versionNumber: approvals.summary.estimate.versionNumber,
                clientApprovedOn: approvals.summary.estimate.approval.clientApprovedOn,
              }
            : null
        }
        sowLock={
          approvals.summary.sow
            ? {
                versionNumber: approvals.summary.sow.versionNumber,
                clientApprovedOn: approvals.summary.sow.approval.clientApprovedOn,
              }
            : null
        }
        clarificationEmail={clarificationEmail.success ? clarificationEmail.data : null}
        positionDocument={positionDocument.success ? positionDocument.data : null}
        clientUpdates={clientUpdates}
        checklistItems={checklistItems.map((item) => ({
          id: item.id,
          label: item.label,
          isComplete: item.isComplete,
          detailText: item.detailText,
        }))}
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={
          deliverablesServicesDocument.success ? deliverablesServicesDocument.data : null
        }
        versions={versionHistory.map(({ content: _content, ...version }) => version)}
        sowChange={sowChange}
        clarificationEmailDraft={
          clarificationEmailVersion
            ? {
                versionNumber: clarificationEmailVersion.versionNumber,
                triggeredByUpdateVersion: clarificationEmailVersion.triggeredByUpdateVersion,
                createdAt: clarificationEmailVersion.createdAt,
              }
            : null
        }
        currentSowTemplate={project.sowTemplate ? { id: project.sowTemplate.id, name: project.sowTemplate.name } : null}
        currentSowTemplateVersion={project.sowTemplateVersion ? { id: project.sowTemplateVersion.id } : null}
        sowTemplateOptions={sowTemplateOptions.map((t) => ({
          id: t.id,
          name: t.name,
          isBaseline: t.isBaseline,
          versions: t.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            fileName: v.fileName,
            status: v.status,
          })),
        }))}
        sowVersions={
          sow?.versions.map((v, index) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            createdAt: v.createdAt,
            ...approvalViewFor(approvals, "SOW", v.id, index === 0),
            sourceEstimateVersionNumber: v.sourceEstimateVersion?.versionNumber ?? null,
            total: v.sourceEstimateTotal === null ? null : Number(v.sourceEstimateTotal),
            currency: v.sourceEstimateCurrency,
            approveBlockedReason: sowApprovalBlockedReason({
              approvedEstimateVersionId: approvals.approvedEstimateVersionId,
              approvedEstimateVersionNumber: approvals.approvedEstimateVersionNumber,
              sowSourceEstimateVersionId: v.sourceEstimateVersionId,
              sowSourceEstimateVersionNumber: v.sourceEstimateVersion?.versionNumber ?? null,
            }),
          })) ?? []
        }
        briefCompleteness={briefCompleteness}
        pmPerspective={pmPerspective}
        confirmedCapabilities={confirmedCapabilities}
        estimateBriefVersion={estimateBriefVersion}
        estimates={estimates.map((estimate) => ({
          id: estimate.id,
          label: estimate.label,
          versions: estimate.versions.map((version, index) => ({
            id: version.id,
            versionNumber: version.versionNumber,
            createdAt: version.createdAt,
            totalValue: Number(version.totalValue),
            currency: version.currency,
            description: version.description,
            needsRecalculation: version.needsRecalculation,
            capabilities: version.capabilitiesIncluded,
            ...approvalViewFor(approvals, "ESTIMATE", version.id, index === 0),
          })),
        }))}
        rateCardOptions={rateCardOptions}
      />
    </div>
  );
}
