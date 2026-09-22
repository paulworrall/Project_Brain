import type { ReactNode } from "react";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { DraftScopeDocument } from "@/types/triage";
import type { DeliverablesServicesDocument } from "@/types/deliverables-services";
import type { WorkflowStep } from "@/types/workflow";
import type { Capability } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { WorkflowStepData } from "./WorkflowStepList";
import { StageTracker, type Phase1Status } from "./StageTracker";
import { Phase1Workspace } from "./Phase1Workspace";
import type { EstimateBriefVersionMeta } from "./CapabilitiesAndEstimateBriefPanel";
import { BriefReadinessIndicator } from "./BriefReadinessIndicator";
import { deriveFoundationDetails } from "@/lib/foundationDetails";
import type { ClientUpdateLogEntry } from "./Phase1Workspace";
import type { DraftScopeDocumentMeta } from "./DraftScopeDocumentCard";
import { ChatPanel } from "./ChatPanel";
import { KnowledgeUpload, type KnowledgeItemView } from "./KnowledgeUpload";
import type { ChecklistItemView } from "./ChecklistView";
import { EditableChecklist } from "./EditableChecklist";
import { SpecialistFeedbackForm } from "./SpecialistFeedbackForm";
import { EstimatesListPanel, type EstimateListItem } from "./EstimatesListPanel";
import { DeliverablesServicesDocumentView } from "./DeliverablesServicesDocumentView";
import { StartSowDevelopmentPanel, type SowTemplateSelectOption } from "./StartSowDevelopmentPanel";
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
}: {
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
  projectId: string;
  projectName: string;
  stages: WorkflowStep[];
  clarificationEmail: ClarificationEmail | null;
  positionDocument: PositionDocumentFields | null;
  clientUpdates: ClientUpdateLogEntry[];
  checklistItems: ChecklistItemView[];
  draftScopeDocument: DraftScopeDocument | null;
  draftScopeDocumentMeta: DraftScopeDocumentMeta | null;
  specialistFeedback: SpecialistFeedbackView | null;
  deliverablesServicesDocument: DeliverablesServicesDocument | null;
  knowledgeItems: KnowledgeItemView[];
  currentSowTemplate: { id: string; name: string } | null;
  currentSowTemplateVersion: { id: string } | null;
  sowTemplateOptions: SowTemplateSelectOption[];
  kickOffDate: Date | null;
  targetCompletionDate: Date | null;
  confirmedCapabilities: Capability[];
  estimateBriefVersion: EstimateBriefVersionMeta | null;
  estimates: EstimateListItem[];
  rateCardOptions: RateCardOption[];
}

/**
 * Derives Phase 1's simplified badge status. Phase 1 no longer has 4
 * discrete completable stages — it's "not started" only in the brief moment
 * before Intake has run, "in progress" for as long as the Position Document
 * is still being shaped by client updates, and flips to "ready for
 * specialist review" once a Draft Scope Document has been generated at
 * least once. This is a status flag only; the real Phase 1 -> Phase 2
 * handoff gets designed when Phase 2 is reviewed next.
 */
function derivePhase1Status(
  stages: WorkflowStep[],
  draftScopeDocument: DraftScopeDocument | null
): Phase1Status {
  const intakeComplete = stages.find((s) => s.stageNumber === 1)?.status === "COMPLETE";
  if (!intakeComplete) {
    return "NOT_STARTED";
  }
  if (draftScopeDocument) {
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
  draftScopeDocument,
  draftScopeDocumentMeta,
  specialistFeedback,
  deliverablesServicesDocument,
  knowledgeItems,
  currentSowTemplate,
  currentSowTemplateVersion,
  sowTemplateOptions,
  kickOffDate,
  targetCompletionDate,
  confirmedCapabilities,
  estimateBriefVersion,
  estimates,
  rateCardOptions,
}: ProjectWorkflowProps) {
  const contentByStage: Record<number, ReactNode> = {
    5: (
      <SpecialistReviewStepContent
        projectId={projectId}
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={deliverablesServicesDocument}
      />
    ),
    6: (
      <EstimatesListPanel projectId={projectId} estimates={estimates} rateCardOptions={rateCardOptions} />
    ),
    8: (
      <StartSowDevelopmentPanel
        projectId={projectId}
        currentTemplate={currentSowTemplate}
        currentTemplateVersion={currentSowTemplateVersion}
        templateOptions={sowTemplateOptions}
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
      positionDocument={positionDocument}
      clientUpdates={clientUpdates}
      clarificationEmail={clarificationEmail}
      draftScopeDocument={draftScopeDocument}
      draftScopeDocumentMeta={draftScopeDocumentMeta}
      checklistItems={checklistItems}
      kickOffDate={kickOffDate}
      targetCompletionDate={targetCompletionDate}
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
    clarifying: positionDocument ? (
      <BriefReadinessIndicator
        categories={deriveFoundationDetails(positionDocument, kickOffDate, targetCompletionDate).categories}
      />
    ) : null,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <StageTracker
        steps={steps}
        phase1Status={derivePhase1Status(stages, draftScopeDocument)}
        phase1Content={phase1Content}
        headerExtraByPhaseKey={headerExtraByPhaseKey}
      />
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <ChatPanel projectId={projectId} projectName={projectName} />
        <KnowledgeUpload projectId={projectId} items={knowledgeItems} />
        <EditableChecklist projectId={projectId} items={checklistItems} />
      </div>
    </div>
  );
}
