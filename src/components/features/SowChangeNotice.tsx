"use client";

import { useId, useState } from "react";
import { formatSowChangeLine, SOW_CHANGE_HEADLINE, type SowChange } from "@/lib/sowChangeView";

const VISIBLE_LINES = 3;

/**
 * The one notice about changes since the SOW was generated, shown above the
 * SOW content on its card — and nowhere else on the page. One line per
 * material change (see SOW_MATERIAL_FIELDS), three visible, the rest behind
 * "Show all (n)". Not dismissible: it clears by itself once a new SOW version
 * is generated that includes the changes. The link opens the existing SOW
 * review step (it never regenerates anything on its own). Amber left border
 * plus the headline text — meaning is never carried by colour alone — in a
 * polite live region. Renders nothing when there are no changes.
 */
export function SowChangeNotice({
  changes,
  onReview,
}: {
  changes: SowChange[];
  /** Opens the SOW review step (the same entry point as "Regenerate SOW"). */
  onReview: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  if (changes.length === 0) return null;

  const visible = showAll ? changes : changes.slice(0, VISIBLE_LINES);
  const hiddenCount = changes.length - VISIBLE_LINES;

  return (
    <div
      role="status"
      className="space-y-1.5 rounded-md border-l-4 border-warning bg-warning-bg px-3 py-2 text-xs text-foreground"
    >
      <p className="font-semibold">{SOW_CHANGE_HEADLINE}</p>
      <ul id={listId} className="space-y-0.5">
        {visible.map((change, index) => (
          <li key={`${change.versionLabel}-${index}`}>{formatSowChangeLine(change)}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {hiddenCount > 0 && (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            aria-expanded={showAll}
            aria-controls={listId}
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show fewer" : `Show all (${changes.length})`}
          </button>
        )}
        <button type="button" className="font-medium text-primary hover:underline" onClick={onReview}>
          Review and update the SOW
        </button>
      </div>
    </div>
  );
}
