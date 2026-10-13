import type { SowSyncStatus, SowVersionSourceLabel } from "@/lib/sowSyncView";

// The pure half of the SOW change notice (no database) — types and wording
// shared by getSowChangeStatus (src/lib/sowChangeStatus.ts) and every surface
// that shows it: the notice on the SOW card, the phase-header indicator, the
// download guard and the estimate page.

export type SowChangeState = "up_to_date" | "changed_since_generation" | "no_sow";

/** One material change since the SOW was generated. Only material changes are ever listed. */
export interface SowChange {
  /** "v3" for an update, "PM edit", "Capabilities" or "Estimate v3". */
  versionLabel: string;
  /** When it happened; null when it can't be dated (e.g. a removed capability). */
  date: Date | null;
  /** Who it came from: "Client", "Internal team", "PM" or "Estimate". */
  source: string;
  /** Plain names of what changed, e.g. ["Budget", "Timeline"]. */
  fields: string[];
  /** One readable line, e.g. the update's own "what changed" summary. */
  summary: string;
}

export interface SowChangeStatus {
  status: SowChangeState;
  /** Newest first. Empty unless status is changed_since_generation. */
  changes: SowChange[];
  /** The latest SOW version; null when there's no SOW. */
  sowVersionId: string | null;
  sowVersionNumber: number | null;
  /** The latest SOW version's comparison with the estimate it's pinned to (null when unlinked or no SOW). */
  estimateSync: SowSyncStatus | null;
  /** Every SOW version labelled with the estimate it came from, newest first. */
  versions: SowVersionSourceLabel[];
}

export const NO_SOW_CHANGE_STATUS: SowChangeStatus = {
  status: "no_sow",
  changes: [],
  sowVersionId: null,
  sowVersionNumber: null,
  estimateSync: null,
  versions: [],
};

export const SOW_CHANGE_HEADLINE = "Updates since this SOW was generated";
export const SOW_PHASE_INDICATOR_TEXT = "Updated since SOW";

const UK_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "v3 · 13 Oct 2026 · Client — Budget restated as €120k". */
export function formatSowChangeLine(change: SowChange): string {
  const parts = [change.versionLabel];
  if (change.date) parts.push(UK_DATE.format(change.date));
  return `${parts.join(" · ")} · ${change.source} — ${change.summary}`;
}

/** The download guard's question for the latest SOW when updates haven't been included, else null. */
export function changedDownloadWarning(status: SowChangeState): string | null {
  return status === "changed_since_generation" ? "This SOW doesn't include the latest updates." : null;
}
