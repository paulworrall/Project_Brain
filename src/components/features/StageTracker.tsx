import type { StepStatus, WorkflowStep } from "@/types/workflow";
import { DELIVERY_MONITORING_STAGE_NUMBER, PHASES } from "@/lib/phases";

const NODE_STATUS_CLASS: Record<StepStatus, string> = {
  NOT_STARTED: "border-border bg-surface text-muted-foreground",
  IN_PROGRESS: "border-primary bg-accent text-primary",
  COMPLETE: "border-success bg-success text-white",
};

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

// Stages beyond this are modeled in the schema but have no built pipeline
// step yet (CLAUDE.md: "1-5 active for MVP; 6-10 modeled but not built yet").
const MVP_STAGE_COUNT = 5;

function derivePhaseStatus(phaseStages: WorkflowStep[]): StepStatus {
  if (phaseStages.length > 0 && phaseStages.every((s) => s.status === "COMPLETE")) {
    return "COMPLETE";
  }
  if (phaseStages.some((s) => s.status === "IN_PROGRESS" || s.status === "COMPLETE")) {
    return "IN_PROGRESS";
  }
  return "NOT_STARTED";
}

export function StageTracker({ stages }: { stages: WorkflowStep[] }) {
  const stageByNumber = new Map(stages.map((stage) => [stage.stageNumber, stage]));

  const phaseSummaries = PHASES.map((phase) => {
    const phaseStages = phase.stageNumbers
      .map((n) => stageByNumber.get(n))
      .filter((s): s is WorkflowStep => s !== undefined);
    return { phase, stages: phaseStages, status: derivePhaseStatus(phaseStages) };
  });

  const activePhaseKey =
    phaseSummaries.find((p) => p.status !== "COMPLETE")?.phase.key ??
    phaseSummaries[phaseSummaries.length - 1]?.phase.key;

  const deliveryStage = stageByNumber.get(DELIVERY_MONITORING_STAGE_NUMBER);

  return (
    <div className="space-y-3">
      {phaseSummaries.map(({ phase, stages: phaseStages, status }, phaseIndex) => {
        const completedCount = phaseStages.filter((s) => s.status === "COMPLETE").length;

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
                {PHASE_STATUS_LABEL[status]} · {completedCount}/{phaseStages.length} stages
              </span>
            </summary>

            <ol className="space-y-2 border-t border-border px-4 py-3">
              {phaseStages.map((stage) => {
                const isBuilt = stage.stageNumber <= MVP_STAGE_COUNT;

                return (
                  <li key={stage.stageNumber} className="flex items-center gap-2 text-sm">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${NODE_STATUS_CLASS[stage.status]} ${isBuilt ? "" : "border-dashed opacity-60"}`}
                    >
                      {stage.status === "COMPLETE" ? "✓" : stage.stageNumber}
                    </span>
                    <span className="text-foreground">{stage.name}</span>
                    {!isBuilt && (
                      <span className="text-xs text-muted-foreground">(Later)</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}

      <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 opacity-70">
        <div>
          <p className="text-sm font-medium text-foreground">Delivery Monitoring</p>
          <p className="text-xs text-muted-foreground">
            {deliveryStage?.name ?? "Commercial Status"} — ongoing, not yet active
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Later</span>
      </div>
    </div>
  );
}
