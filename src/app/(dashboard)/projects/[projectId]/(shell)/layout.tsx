import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefStep, EstimateStep, SowStep } from "@/components/features/ProjectWorkflow";
import { ProjectSummaryBar } from "@/components/features/ProjectSummaryBar";
import { ProjectSidebar } from "@/components/features/ProjectSidebar";
import { ProjectShell } from "@/components/features/ProjectShell";
import { loadProjectPageData } from "@/lib/projectPageData";
import { approvalViewFor } from "@/lib/commercial/approvalViewData";
import { sowApprovalBlockedReason } from "@/lib/commercial/sowApprovalGate";
import { NEEDS_REVIEW_TEXT } from "@/lib/estimateScopeSyncView";

/**
 * The persistent project shell: breadcrumb, title, header box, the Brief →
 * Estimate → SOW stepper and the Project assistant sidebar. It renders once
 * and survives step switches, so the sidebar never remounts. All three steps'
 * content is rendered here (only the active one shown) so unsaved edits in a
 * step are not lost on a switch — see ProjectShell. Each step's route page
 * renders nothing of its own.
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
    projectStatus,
    projectManagerOptions,
    sowTemplateOptions,
    rateCardOptions,
    scopeSummary,
    openQuestions,
    openQuestionsText,
    missingMsaRateCard,
    estimateScopeSync,
    nextAction,
    briefAssessment,
    earlierDocuments,
    permissions,
    approvals,
    briefCompleteness,
    pmPerspective,
    versionHistory,
    sowChange,
    clientUpdates,
    confirmedCapabilities,
    estimateBriefVersion,
    estimates,
    sow,
    stepStatuses,
    stepSummaries,
    projectComplete,
    specialistRows,
  } = data;

  const versions = versionHistory.map(({ content: _content, ...version }) => version);
  const estimateApproved = approvals.summary.estimate !== null;
  const common = { projectId: project.id, projectComplete };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/browse" className="hover:underline">
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
          <h1 className="mt-1 text-3xl leading-tight font-light text-foreground sm:text-4xl">
            {project.name}
          </h1>
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
            ? {
                id: project.rateCard.id,
                name: project.rateCard.name,
                currency: project.rateCard.currency,
              }
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
        stepStatuses={stepStatuses}
        stepSummaries={stepSummaries}
        nextAction={nextAction}
        openQuestionsText={openQuestionsText}
        // FB-009 B: a step whose document is stale against what it was built from.
        attention={{
          ...(estimateScopeSync.needsReview ? { estimate: NEEDS_REVIEW_TEXT } : {}),
          ...(sowChange?.status === "changed_since_generation" ? { sow: NEEDS_REVIEW_TEXT } : {}),
        }}
        steps={{
          brief: (
            <BriefStep
              {...common}
              scopeSummary={scopeSummary}
              briefAssessment={briefAssessment}
              earlierDocuments={earlierDocuments}
              openQuestions={openQuestions}
              missingMsaRateCard={missingMsaRateCard}
              clientName={client.name}
              clientUpdates={clientUpdates}
              briefCompleteness={briefCompleteness}
              pmPerspective={pmPerspective}
              scopeConfirmedAt={project.scopeConfirmedAt?.toISOString() ?? null}
              scopeConfirmedByName={project.scopeConfirmedBy?.name ?? null}
              estimateApproved={estimateApproved}
            />
          ),
          estimate: (
            <EstimateStep
              {...common}
              scopeConfirmed={project.scopeConfirmedAt !== null}
              confirmedCapabilities={confirmedCapabilities}
              estimateBriefVersion={estimateBriefVersion}
              specialistRows={specialistRows}
              estimates={estimates.map((estimate) => ({
                id: estimate.id,
                label: estimate.label,
                scopeSync: estimateScopeSync.estimates.find((e) => e.estimateId === estimate.id),
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
              estimateLock={
                approvals.summary.estimate
                  ? {
                      versionNumber: approvals.summary.estimate.versionNumber,
                      clientApprovedOn: approvals.summary.estimate.approval.clientApprovedOn,
                    }
                  : null
              }
              approvalPermissions={permissions}
            />
          ),
          sow: (
            <SowStep
              {...common}
              estimateApproved={estimateApproved}
              sowChange={sowChange}
              currentSowTemplate={
                project.sowTemplate
                  ? { id: project.sowTemplate.id, name: project.sowTemplate.name }
                  : null
              }
              currentSowTemplateVersion={
                project.sowTemplateVersion ? { id: project.sowTemplateVersion.id } : null
              }
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
              sowLock={
                approvals.summary.sow
                  ? {
                      versionNumber: approvals.summary.sow.versionNumber,
                      clientApprovedOn: approvals.summary.sow.approval.clientApprovedOn,
                    }
                  : null
              }
              approvalPermissions={permissions}
            />
          ),
        }}
        sidebar={
          <ProjectSidebar
            projectId={project.id}
            projectName={project.name}
            versions={versions}
            projectComplete={projectComplete}
          />
        }
      >
        {children}
      </ProjectShell>
    </div>
  );
}
