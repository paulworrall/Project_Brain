import type { ReactNode } from "react";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { DeliverablesServicesDocument } from "@/types/deliverables-services";
import type { WorkflowStep } from "@/types/workflow";
import type { Capability } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { WorkflowStepData } from "./WorkflowStepList";
import { StageTracker, type Phase1Status } from "./StageTracker";
import { Phase1Workspace } from "./Phase1Workspace";
import type { EstimateBriefVersionMeta } from "./CapabilitiesAndEstimateBriefPanel";
import { BriefReadinessIndicator } from "./BriefReadinessIndicator";
import { BriefCompletenessWarning } from "./BriefGateNotice";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";
import type { ClientUpdateLogEntry } from "./Phase1Workspace";
import { ChatPanel } from "./ChatPanel";
import { StaleOutputNotice } from "./StaleOutputNotice";
import type { OutputFreshness } from "@/lib/freshness";
import type { ProjectOutputFreshness } from "@/lib/outputFreshness";
import { KnowledgeUpload, type VersionView } from "./KnowledgeUpload";
import type { ChecklistItemView } from "./ChecklistView";
import { EditableChecklist } from "./EditableChecklist";
import { SpecialistFeedbackForm } from "./SpecialistFeedbackForm";
import { EstimatesListPanel, type EstimateListItem } from "./EstimatesListPanel";
import { DeliverablesServicesDocumentView } from "./DeliverablesServicesDocumentView";
import {
  StartSowDevelopmentPanel,
  type SowTemplateSelectOption,
  type SowVersionMeta,
} from "./StartSowDevelopmentPanel";
import type { RateCardOption } from "@/app/(dashboard)/projects/new/actions";

function PlaceholderStepContent({
  taskRef,
  actionLabel,
}: {
  taskRef: string;
  actionLabel: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Coming in task {taskRef}.</p>
      <button
        type="button"
        disabled
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground opacity-50"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export interface SpecialistFeedbackView {
  content: string;
  capability: Capability | null;
  otherCapabilityLabel: string | null;
}

function SpecialistReviewStepContent({
  projectId,
  specialistFeedback,
  deliverablesServicesDocument,
  freshness,
}: {
  freshness?: OutputFreshness;
  projectId: string;
  specialistFeedback: SpecialistFeedbackView | null;
  deliverablesServicesDocument: DeliverablesServicesDocument | null;
}) {
  if (specialistFeedback === null) {
    return <SpecialistFeedbackForm projectId={projectId} />;
  }

  const capabilityDisplay = specialistFeedback.capability
    ? capabilityLabel(specialistFeedback.capability)
    : specialistFeedback.otherCapabilityLabel;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Input
        </h3>
        {capabilityDisplay && (
          <span className="mt-1 inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {capabilityDisplay}
          </span>
        )}
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
          {specialistFeedback.content}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Output — Deliverables + Services Document
        </h3>
        <div className="mb-2">
          <StaleOutputNotice
            freshness={freshness}
            flagOnlyHint="This comes from the specialists' feedback, so it isn't regenerated automatically — check whether their input still holds."
          />
        </div>
        {deliverablesServicesDocument ? (
          <DeliverablesServicesDocumentView
            projectId={projectId}
            document={deliverablesServicesDocument}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>
    </div>
  );
}

interface ProjectWorkflowProps {
  /** Which generated outputs no longer reflect the project (see getOutputFreshness). */
  outputFreshness?: ProjectOutputFreshness;
  projectId: string;
  projectName: string;
  stages: WorkflowStep[];
  clarificationEmail: ClarificationEmail | null;
  positionDocument: PositionDocumentFields | null;
  clientUpdates: ClientUpdateLogEntry[];
  checklistItems: ChecklistItemView[];
  specialistFeedback: SpecialistFeedbackView | null;
  deliverablesServicesDocument: DeliverablesServicesDocument | null;
  versions: VersionView[];
  currentSowTemplate: { id: string; name: string } | null;
  currentSowTemplateVersion: { id: string } | null;
  sowTemplateOptions: SowTemplateSelectOption[];
  sowVersions: SowVersionMeta[];
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  confirmedCapabilities: Capability[];
  estimateBriefVersion: EstimateBriefVersionMeta | null;
  estimates: EstimateListItem[];
  rateCardOptions: RateCardOption[];
}

/**
 * Derives Phase 1's simplified badge status. Phase 1 no longer has 4
 * discrete completable stages — it's "not started" only in the brief moment
 * before Intake has run, "in progress" for as long as the brief is still
 * being shaped by client updates, and flips to "ready for specialist
 * review" once Phase 1 has been completed (Stage 4 COMPLETE — set when the
 * first Estimate Brief is prepared; older projects got there by generating
 * the since-removed Draft Scope Document).
 */
function derivePhase1Status(stages: WorkflowStep[]): Phase1Status {
  const statusOf = (n: number) => stages.find((s) => s.stageNumber === n)?.status;
  if (statusOf(1) !== "COMPLETE") {
    return "NOT_STARTED";
  }
  if (statusOf(4) === "COMPLETE") {
    return "READY_FOR_SPECIALIST_REVIEW";
  }
  return "IN_PROGRESS";
}

export function ProjectWorkflow({
  projectId,
  projectName,
  stages,
  clarificationEmail,
  positionDocument,
  clientUpdates,
  checklistItems,
  specialistFeedback,
  deliverablesServicesDocument,
  versions,
  currentSowTemplate,
  currentSowTemplateVersion,
  sowTemplateOptions,
  sowVersions,
  briefCompleteness,
  pmPerspective,
  confirmedCapabilities,
  estimateBriefVersion,
  estimates,
  rateCardOptions,
  outputFreshness = { estimates: {} },
}: ProjectWorkflowProps) {
  const contentByStage: Record<number, ReactNode> = {
    5: (
      <SpecialistReviewStepContent
        projectId={projectId}
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={deliverablesServicesDocument}
        freshness={outputFreshness.deliverablesServices}
      />
    ),
    6: (
      <EstimatesListPanel
        projectId={projectId}
        estimates={estimates}
        rateCardOptions={rateCardOptions}
        freshnessByEstimate={outputFreshness.estimates}
      />
    ),
    8: (
      <StartSowDevelopmentPanel
        projectId={projectId}
        sowFreshness={outputFreshness.sow}
        currentTemplate={currentSowTemplate}
        currentTemplateVersion={currentSowTemplateVersion}
        templateOptions={sowTemplateOptions}
        sowVersions={sowVersions}
        briefCompleteness={briefCompleteness}
      />
    ),
    9: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
    10: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
  };

  const steps: WorkflowStepData[] = stages.map((stage) => ({
    ...stage,
    content: contentByStage[stage.stageNumber] ?? null,
  }));

  const phase1Content = (
    <Phase1Workspace
      projectId={projectId}
      outputFreshness={outputFreshness}
      positionDocument={positionDocument}
      clientUpdates={clientUpdates}
      clarificationEmail={clarificationEmail}
      checklistItems={checklistItems}
      briefCompleteness={briefCompleteness}
      pmPerspective={pmPerspective}
      confirmedCapabilities={confirmedCapabilities}
      estimateBriefVersion={estimateBriefVersion}
    />
  );

  // Shown in Phase 1's step header itself (always visible, expanded or not)
  // rather than inside Phase1Workspace's body — see StageTracker's
  // headerExtraByPhaseKey. Phase 1 is Foundation-Details-driven so it must be
  // supplied explicitly; Phase 2/3 have no entry here and fall back to
  // StageTracker's own auto-built per-stage strip, keeping all three uniform.
  const headerExtraByPhaseKey = {
    clarifying: <BriefReadinessIndicator completeness={briefCompleteness} />,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="min-w-0 space-y-4">
      <BriefCompletenessWarning completeness={briefCompleteness} />
      <StageTracker
        steps={steps}
        phase1Status={derivePhase1Status(stages)}
        phase1Content={phase1Content}
        headerExtraByPhaseKey={headerExtraByPhaseKey}
      />
      </div>
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <ChatPanel projectId={projectId} projectName={projectName} />
        <KnowledgeUpload projectId={projectId} versions={versions} />
        <EditableChecklist projectId={projectId} items={checklistItems} />
      </div>
    </div>
  );
}
