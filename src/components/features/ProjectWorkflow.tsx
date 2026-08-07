import type { ReactNode } from "react";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { DraftScopeDocument } from "@/types/triage";
import type { DeliverablesServicesDocument } from "@/types/deliverables-services";
import type { WorkflowStep } from "@/types/workflow";
import { WorkflowStepList, type WorkflowStepData } from "./WorkflowStepList";
import { ChatPanel } from "./ChatPanel";
import { ClarificationEmailView } from "./ClarificationEmailView";
import { PositionDocumentView } from "./PositionDocumentView";
import { ChecklistView, type ChecklistItemView } from "./ChecklistView";
import { ClarificationNotesForm } from "./ClarificationNotesForm";
import { RunTriageAgentButton } from "./RunTriageAgentButton";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";
import { SpecialistFeedbackForm } from "./SpecialistFeedbackForm";
import { DeliverablesServicesDocumentView } from "./DeliverablesServicesDocumentView";

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

function IntakeStepContent({
  briefFileName,
  positionDocument,
  checklistItems,
}: {
  briefFileName: string | null;
  positionDocument: PositionDocumentFields | null;
  checklistItems: ChecklistItemView[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Input
        </h3>
        <p className="mt-1 text-sm text-foreground">
          Brief: {briefFileName ?? "Pasted text"}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Outputs
        </h3>
        <div className="space-y-4">
          {positionDocument ? (
            <PositionDocumentView fields={positionDocument} />
          ) : (
            <p className="text-sm text-muted-foreground">Not generated yet.</p>
          )}
          <ChecklistView items={checklistItems} />
        </div>
      </div>
    </div>
  );
}

function GetClarificationsStepContent({
  projectId,
  clarificationNotes,
  updatedPositionDocument,
}: {
  projectId: string;
  clarificationNotes: string | null;
  updatedPositionDocument: PositionDocumentFields | null;
}) {
  if (clarificationNotes === null) {
    return <ClarificationNotesForm projectId={projectId} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Input
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{clarificationNotes}</p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Output — Position Document Updated
        </h3>
        {updatedPositionDocument ? (
          <PositionDocumentView fields={updatedPositionDocument} />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>
    </div>
  );
}

function TriageStepContent({
  projectId,
  stageStatus,
  draftScopeDocument,
}: {
  projectId: string;
  stageStatus: WorkflowStep["status"];
  draftScopeDocument: DraftScopeDocument | null;
}) {
  if (draftScopeDocument) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Output
        </h3>
        <DraftScopeDocumentView scope={draftScopeDocument} />
      </div>
    );
  }

  if (stageStatus === "IN_PROGRESS") {
    return <RunTriageAgentButton projectId={projectId} />;
  }

  return <p className="text-sm text-muted-foreground">Waiting on Step 3 to complete.</p>;
}

function SpecialistReviewStepContent({
  projectId,
  specialistFeedback,
  deliverablesServicesDocument,
}: {
  projectId: string;
  specialistFeedback: string | null;
  deliverablesServicesDocument: DeliverablesServicesDocument | null;
}) {
  if (specialistFeedback === null) {
    return <SpecialistFeedbackForm projectId={projectId} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Input
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{specialistFeedback}</p>
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
  briefFileName: string | null;
  stages: WorkflowStep[];
  clarificationEmail: ClarificationEmail | null;
  positionDocument: PositionDocumentFields | null;
  checklistItems: ChecklistItemView[];
  clarificationNotes: string | null;
  draftScopeDocument: DraftScopeDocument | null;
  specialistFeedback: string | null;
  deliverablesServicesDocument: DeliverablesServicesDocument | null;
}

export function ProjectWorkflow({
  projectId,
  projectName,
  briefFileName,
  stages,
  clarificationEmail,
  positionDocument,
  checklistItems,
  clarificationNotes,
  draftScopeDocument,
  specialistFeedback,
  deliverablesServicesDocument,
}: ProjectWorkflowProps) {
  const triageStageStatus = stages.find((s) => s.stageNumber === 4)?.status ?? "NOT_STARTED";

  const contentByStage: Record<number, ReactNode> = {
    1: (
      <IntakeStepContent
        briefFileName={briefFileName}
        positionDocument={positionDocument}
        checklistItems={checklistItems}
      />
    ),
    2: (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Output
        </h3>
        {clarificationEmail ? (
          <ClarificationEmailView email={clarificationEmail} />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>
    ),
    3: (
      <GetClarificationsStepContent
        projectId={projectId}
        clarificationNotes={clarificationNotes}
        updatedPositionDocument={positionDocument}
      />
    ),
    4: (
      <TriageStepContent
        projectId={projectId}
        stageStatus={triageStageStatus}
        draftScopeDocument={draftScopeDocument}
      />
    ),
    5: (
      <SpecialistReviewStepContent
        projectId={projectId}
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={deliverablesServicesDocument}
      />
    ),
    6: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
    7: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Submit Session Notes" />,
    8: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
    9: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
    10: <PlaceholderStepContent taskRef="Level 3 (post-MVP)" actionLabel="Run Agent" />,
  };

  const steps: WorkflowStepData[] = stages.map((stage) => ({
    ...stage,
    content: contentByStage[stage.stageNumber] ?? null,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <WorkflowStepList steps={steps} />
      <div className="lg:sticky lg:top-6 lg:self-start">
        <ChatPanel projectName={projectName} />
      </div>
    </div>
  );
}
