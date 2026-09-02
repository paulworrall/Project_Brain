export type ReadinessState = "confirmed" | "partial" | "missing";

export interface ReadinessSegment {
  key: string;
  label: string;
  state: ReadinessState;
}

// Decorative/summary strip — colour is reinforced by a per-segment title
// tooltip and the plain-text headline, never colour alone. Shared by every
// phase header (Brief Readiness for Phase 1, stage-completion strips for
// Phase 2/3) so all three render the identical visual language.
const SEGMENT_CLASS: Record<ReadinessState, string> = {
  confirmed: "bg-success",
  partial: "bg-warning",
  missing: "bg-surface-muted",
};

export interface ReadinessStripProps {
  segments: ReadinessSegment[];
  headline: string;
  ariaLabel: string;
}

export function ReadinessStrip({ segments, headline, ariaLabel }: ReadinessStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="img" aria-label={ariaLabel} className="flex gap-1">
        {segments.map((segment) => (
          <span
            key={segment.key}
            title={`${segment.label}: ${segment.state}`}
            className={`h-2 w-8 rounded-full transition-colors duration-300 motion-reduce:transition-none ${SEGMENT_CLASS[segment.state]}`}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-muted-foreground">{headline}</span>
    </div>
  );
}
