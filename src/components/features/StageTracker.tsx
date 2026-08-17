import type { ReactNode } from "react";
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

/**
 * Phase 1's badge status — it no longer has 4 discrete completable stages to
 * count, so its accordion header shows one of these instead of "x/N stages".
 * READY_FOR_SPECIALIST_REVIEW is just a status flag for now; the real
 * Phase 1 -> Phase 2 handoff gets designed when Phase 2 is reviewed next.
 */
export type Phase1Status = "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_SPECIALIST_REVIEW";

const PHASE1_BADGE_CLASS: Record<Phase1Status, string> = {
  NOT_STARTED: "bg-surface-muted text-muted-foreground",
  IN_PROGRESS: "bg-accent text-primary",
  READY_FOR_SPECIALIST_REVIEW: "bg-success text-white",
};

const PHASE1_STATUS_LABEL: Record<Phase1Status, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  READY_FOR_SPECIALIST_REVIEW: "Ready for specialist review",
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

export function StageTracker({
  steps,
  phase1Status,
  phase1Content,
}: {
  steps: WorkflowStepData[];
  phase1Status: Phase1Status;
  phase1Content: ReactNode;
}) {
  const stepByNumber = new Map(steps.map((step) => [step.stageNumber, step]));

  const phaseSummaries = PHASES.map((phase) => {
    const phaseSteps = phase.stageNumbers
      .map((n) => stepByNumber.get(n))
      .filter((s): s is WorkflowStepData => s !== undefined)
      .map((step) => ({ ...step, label: getStepLabel(step.stageNumber) }));
    return { phase, steps: phaseSteps, status: derivePhaseStatus(phaseSteps) };
  });

  const activePhaseKey =
    phase1Status !== "READY_FOR_SPECIALIST_REVIEW"
      ? "clarifying"
      : (phaseSummaries.find((p) => p.phase.key !== "clarifying" && p.status !== "COMPLETE")
          ?.phase.key ?? phaseSummaries[phaseSummaries.length - 1]?.phase.key);

  const deliveryStep = stepByNumber.get(DELIVERY_MONITORING_STAGE_NUMBER);

  return (
    <div className="space-y-3">
      {phaseSummaries.map(({ phase, steps: phaseSteps, status }, phaseIndex) => {
        const isPhase1 = phase.key === "clarifying";
        const completedCount = phaseSteps.filter((s) => s.status === "COMPLETE").length;
        const badgeClass = isPhase1 ? PHASE1_BADGE_CLASS[phase1Status] : PHASE_BADGE_CLASS[status];
        const isBadgeComplete = isPhase1
          ? phase1Status === "READY_FOR_SPECIALIST_REVIEW"
          : status === "COMPLETE";

        return (
          <details
            key={phase.key}
            open={phase.key === activePhaseKey}
            className="rounded-lg border border-border bg-surface"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${badgeClass}`}
                >
                  {isBadgeComplete ? "✓" : phaseIndex + 1}
                </span>
                <span className="text-sm font-medium text-foreground">{phase.name}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {isPhase1
                  ? PHASE1_STATUS_LABEL[phase1Status]
                  : `${PHASE_STATUS_LABEL[status]} · ${completedCount}/${phaseSteps.length} stages`}
              </span>
            </summary>

            <div className="border-t border-border px-4 py-3">
              {isPhase1 ? phase1Content : <WorkflowStepList steps={phaseSteps} />}
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
