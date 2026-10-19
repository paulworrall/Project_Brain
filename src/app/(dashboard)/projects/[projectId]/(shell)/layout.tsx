import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoverPhaseContent } from "@/components/features/ProjectWorkflow";
import { ProjectSummaryBar } from "@/components/features/ProjectSummaryBar";
import { ProjectSidebar } from "@/components/features/ProjectSidebar";
import { ProjectShell } from "@/components/features/ProjectShell";
import { loadProjectPageData } from "@/lib/projectPageData";
import { approvalViewFor } from "@/lib/commercial/approvalViewData";
import { sowApprovalBlockedReason } from "@/lib/commercial/sowApprovalGate";

/**
 * The persistent project shell: breadcrumb, title, header box, phase tab bar
 * and the project sidebar. It renders once and survives phase-tab switches, so
 * the sidebar never remounts. Discover's content is rendered here too (and
 * hidden while another phase is showing) so unsaved edits in its cards are not
 * lost on a tab switch — see ProjectShell. Other phases render via `children`.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await loadProjectPageData(projectId);
  if (!data) {
    notFound();
  }

  const {
    project,
    workstream,
    client,
    hub,
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
    checklistItems,
    confirmedCapabilities,
    estimateBriefVersion,
    estimates,
    sow,
    phaseStatuses,
  } = data;

  const versions = versionHistory.map(({ content: _content, ...version }) => version);
  const checklistView = checklistItems.map((item) => ({
    id: item.id,
    label: item.label,
    isComplete: item.isComplete,
    detailText: item.detailText,
  }));

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

      <ProjectShell
        projectId={project.id}
        phaseStatuses={phaseStatuses}
        discover={
          <DiscoverPhaseContent
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
            checklistItems={checklistView}
            specialistFeedback={specialistFeedback}
            deliverablesServicesDocument={
              deliverablesServicesDocument.success ? deliverablesServicesDocument.data : null
            }
            versions={versions}
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
        }
        sidebar={
          <ProjectSidebar
            projectId={project.id}
            projectName={project.name}
            versions={versions}
            checklistItems={checklistView}
            approvedDocuments={approvals.summary}
          />
        }
      >
        {children}
      </ProjectShell>
    </div>
  );
}
