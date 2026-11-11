export type ReadinessState = "confirmed" | "partial" | "missing";

export interface ReadinessSegment {
  key: string;
  label: string;
  state: ReadinessState;
}

// Decorative/summary strip — reinforced by a per-segment title tooltip and the
// plain-text headline. Segments differ by fill *and* outline, not hue alone
// (MAP status fills are ~1.2–1.7:1 on White): solid Navy, Amber with a Navy
// outline, or an empty outline. Shared by every phase header so all three
// render the identical visual language.
const SEGMENT_CLASS: Record<ReadinessState, string> = {
  confirmed: "bg-navy border border-navy",
  partial: "bg-amber border border-navy",
  missing: "bg-surface border border-border-strong",
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
            className={`h-2.5 w-8 transition-colors duration-300 motion-reduce:transition-none ${SEGMENT_CLASS[segment.state]}`}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-muted-foreground">{headline}</span>
    </div>
  );
}
