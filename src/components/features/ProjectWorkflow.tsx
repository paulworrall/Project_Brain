import type { ReactNode } from "react";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { WorkflowStep } from "@/types/workflow";
import { WorkflowStepList, type WorkflowStepData } from "./WorkflowStepList";
import { ChatPanel } from "./ChatPanel";
import { ClarificationEmailView } from "./ClarificationEmailView";
import { PositionDocumentView } from "./PositionDocumentView";
import { ChecklistView, type ChecklistItemView } from "./ChecklistView";

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

interface ProjectWorkflowProps {
  projectName: string;
  briefFileName: string | null;
  stages: WorkflowStep[];
  clarificationEmail: ClarificationEmail | null;
  positionDocument: PositionDocumentFields | null;
  checklistItems: ChecklistItemView[];
}

export function ProjectWorkflow({
  projectName,
  briefFileName,
  stages,
  clarificationEmail,
  positionDocument,
  checklistItems,
}: ProjectWorkflowProps) {
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
    3: <PlaceholderStepContent taskRef="5.1–5.2" actionLabel="Submit Client Notes" />,
    4: <PlaceholderStepContent taskRef="5.4" actionLabel="Run Triage Agent" />,
    5: <PlaceholderStepContent taskRef="6.0" actionLabel="Submit Specialist Feedback" />,
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
