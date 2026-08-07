"use client";

import { type ReactNode, useState } from "react";
import { Card } from "@/components/ui/Card";
import { STEP_KIND_BY_STAGE, type StepStatus } from "@/types/workflow";

export interface WorkflowStepData {
  stageNumber: number;
  name: string;
  status: StepStatus;
  content: ReactNode;
}

const STATUS_LABEL: Record<StepStatus, string> = {
  NOT_STARTED: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
};

const STATUS_BADGE_CLASS: Record<StepStatus, string> = {
  NOT_STARTED: "bg-surface-muted text-muted-foreground",
  IN_PROGRESS: "bg-accent text-accent-foreground",
  COMPLETE: "bg-success-bg text-success",
};

function StepIcon({ status, stageNumber }: { status: StepStatus; stageNumber: number }) {
  if (status === "COMPLETE") {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-sm font-semibold text-white"
      >
        ✓
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-accent text-sm font-semibold text-primary"
      >
        {stageNumber}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-sm font-medium text-muted-foreground"
    >
      {stageNumber}
    </span>
  );
}

function findDefaultExpandedStage(steps: WorkflowStepData[]): number {
  const current = steps.find((s) => s.status !== "COMPLETE");
  return current?.stageNumber ?? steps[0]?.stageNumber ?? 1;
}

export function WorkflowStepList({ steps }: { steps: WorkflowStepData[] }) {
  const [expandedStage, setExpandedStage] = useState<number>(() =>
    findDefaultExpandedStage(steps)
  );

  return (
    <ol className="space-y-2">
      {steps.map((step) => {
        const isExpanded = expandedStage === step.stageNumber;
        const kind = STEP_KIND_BY_STAGE[step.stageNumber];

        return (
          <li key={step.stageNumber}>
            <Card className={isExpanded ? "border-primary" : undefined}>
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedStage(isExpanded ? -1 : step.stageNumber)
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <StepIcon status={step.status} stageNumber={step.stageNumber} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Step {step.stageNumber} — {step.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {kind === "AGENT" ? "AI Agent" : "Human Input"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[step.status]}`}
                >
                  {STATUS_LABEL[step.status]}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-border px-4 py-4">{step.content}</div>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
