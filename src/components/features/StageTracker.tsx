import type { StepStatus } from "@/types/workflow";
import { DELIVERY_MONITORING_STAGE_NUMBER, PHASES, getStepLabel } from "@/lib/phases";
import { WorkflowStepList, type WorkflowStepData } from "./WorkflowStepList";

const PHASE_BADGE_CLASS: Record<StepStatus, string> = {
  NOT_STARTED: "bg-surface-muted text-muted-foreground",
  IN_PROGRESS: "bg-accent text-primary",
  COMPLETE: "bg-success text-white",
};

const PHASE_STATUS_LABEL: Record<StepStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

function derivePhaseStatus(phaseSteps: WorkflowStepData[]): StepStatus {
  if (phaseSteps.length > 0 && phaseSteps.every((s) => s.status === "COMPLETE")) {
    return "COMPLETE";
  }
  if (phaseSteps.some((s) => s.status === "IN_PROGRESS" || s.status === "COMPLETE")) {
    return "IN_PROGRESS";
  }
  return "NOT_STARTED";
}

export function StageTracker({ steps }: { steps: WorkflowStepData[] }) {
  const stepByNumber = new Map(steps.map((step) => [step.stageNumber, step]));

  const phaseSummaries = PHASES.map((phase) => {
    const phaseSteps = phase.stageNumbers
      .map((n) => stepByNumber.get(n))
      .filter((s): s is WorkflowStepData => s !== undefined)
      .map((step) => ({ ...step, label: getStepLabel(step.stageNumber) }));
    return { phase, steps: phaseSteps, status: derivePhaseStatus(phaseSteps) };
  });

  const activePhaseKey =
    phaseSummaries.find((p) => p.status !== "COMPLETE")?.phase.key ??
    phaseSummaries[phaseSummaries.length - 1]?.phase.key;

  const deliveryStep = stepByNumber.get(DELIVERY_MONITORING_STAGE_NUMBER);

  return (
    <div className="space-y-3">
      {phaseSummaries.map(({ phase, steps: phaseSteps, status }, phaseIndex) => {
        const completedCount = phaseSteps.filter((s) => s.status === "COMPLETE").length;

        return (
          <details
            key={phase.key}
            open={phase.key === activePhaseKey}
            className="rounded-lg border border-border bg-surface"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${PHASE_BADGE_CLASS[status]}`}
                >
                  {status === "COMPLETE" ? "✓" : phaseIndex + 1}
                </span>
                <span className="text-sm font-medium text-foreground">{phase.name}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {PHASE_STATUS_LABEL[status]} · {completedCount}/{phaseSteps.length} stages
              </span>
            </summary>

            <div className="border-t border-border px-4 py-3">
              <WorkflowStepList steps={phaseSteps} />
            </div>
          </details>
        );
      })}

      <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 opacity-70">
        <div>
          <p className="text-sm font-medium text-foreground">Delivery Monitoring</p>
          <p className="text-xs text-muted-foreground">
            {deliveryStep?.name ?? "Commercial Status"} — ongoing, not yet active
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Later</span>
      </div>
    </div>
  );
}
