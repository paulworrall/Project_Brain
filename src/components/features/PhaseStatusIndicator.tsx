import { PHASE_STATUS_LABEL, type PhaseStatus } from "@/lib/projectPhases";

/** Status as icon + text — never colour alone. */
export function PhaseStatusIndicator({
  status,
  className = "text-muted-foreground",
}: {
  status: PhaseStatus;
  /** Text colour; the active tab passes a stronger one for AA contrast on its tint. */
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        {status === "complete" ? (
          <>
            <circle cx="8" cy="8" r="7" fill="currentColor" className="text-success" />
            <path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : status === "in_progress" ? (
          <>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
            <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" className="text-primary" />
          </>
        ) : (
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        )}
      </svg>
      {PHASE_STATUS_LABEL[status]}
    </span>
  );
}
