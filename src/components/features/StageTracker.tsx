import type { WorkflowStep } from "@/types/workflow";

const NODE_STATUS_CLASS: Record<WorkflowStep["status"], string> = {
  NOT_STARTED: "border-border bg-surface text-muted-foreground",
  IN_PROGRESS: "border-primary bg-accent text-primary",
  COMPLETE: "border-success bg-success text-white",
};

const CONNECTOR_STATUS_CLASS: Record<WorkflowStep["status"], string> = {
  NOT_STARTED: "bg-border",
  IN_PROGRESS: "bg-border",
  COMPLETE: "bg-success",
};

// Stages beyond this are modeled in the schema but have no built pipeline
// step yet (CLAUDE.md: "1-5 active for MVP; 6-10 modeled but not built yet").
const MVP_STAGE_COUNT = 5;

export function StageTracker({ stages }: { stages: WorkflowStep[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {stages.map((stage, index) => {
          const isBuilt = stage.stageNumber <= MVP_STAGE_COUNT;

          return (
            <li key={stage.stageNumber} className="flex items-start">
              <div className="flex w-20 flex-col items-center gap-1.5" title={stage.name}>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${NODE_STATUS_CLASS[stage.status]} ${isBuilt ? "" : "border-dashed opacity-60"}`}
                >
                  {stage.status === "COMPLETE" ? "✓" : stage.stageNumber}
                </span>
                <span className="line-clamp-2 text-center text-[11px] leading-tight text-muted-foreground">
                  {stage.name}
                </span>
                {!isBuilt && <span className="text-[10px] text-muted-foreground">Later</span>}
              </div>
              {index < stages.length - 1 && (
                <div
                  aria-hidden
                  className={`mt-4 h-0.5 w-6 shrink-0 ${CONNECTOR_STATUS_CLASS[stage.status]}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
