/**
 * FB-009 B: scope → estimate sync — the pure half (no database), safe for
 * client components. Mirrors estimate → SOW sync (sowSyncView.ts): an
 * estimate version records the confirmed Scope summary version it was built
 * against (EstimateVersion.sourceScopeVersionId); it is stale once a newer
 * Scope summary version has been confirmed, and unlinked when it has no source
 * (saved before FB-009, or with no confirmed scope). Derived on read by
 * comparing version ids — never stored. Never regenerates anything.
 */

export type EstimateScopeSyncState = "in_sync" | "stale" | "unlinked";

export interface ScopeVersionRef {
  id: string;
  versionNumber: number;
  createdAt: Date;
}

export interface EstimateScopeSync {
  estimateId: string;
  status: EstimateScopeSyncState;
  /** The scope version the estimate's latest version was built against. */
  sourceVersionNumber: number | null;
  /** The currently confirmed scope version. */
  confirmedVersionNumber: number | null;
  confirmedAt: Date | null;
  /** Labels of the Scope summary sections that changed between the two. */
  changedSections: string[];
  /** The estimate is client approved: the flag is information only (change request). */
  approved: boolean;
}

export function evaluateEstimateScopeSync({
  estimateId,
  source,
  confirmed,
  changedSections,
  approved,
}: {
  estimateId: string;
  source: ScopeVersionRef | null;
  confirmed: ScopeVersionRef | null;
  changedSections: string[];
  approved: boolean;
}): EstimateScopeSync {
  const base = {
    estimateId,
    sourceVersionNumber: source?.versionNumber ?? null,
    confirmedVersionNumber: confirmed?.versionNumber ?? null,
    confirmedAt: confirmed?.createdAt ?? null,
    approved,
  };
  if (!source || !confirmed) return { ...base, status: "unlinked", changedSections: [] };
  if (source.id === confirmed.id || confirmed.versionNumber <= source.versionNumber) {
    return { ...base, status: "in_sync", changedSections: [] };
  }
  return { ...base, status: "stale", changedSections };
}

export const ESTIMATE_SCOPE_HEADLINE = "Scope changed since this estimate";
export const NEEDS_REVIEW_TEXT = "Needs review";
export const CHANGE_REQUEST_NOTE =
  "This estimate is client approved, so it stays as approved. Changes will need a change request (coming soon).";

/** The notice line: "Scope v3 · 4 Nov · Changed: Deliverables, Assumptions — this estimate used v2". */
export function estimateScopeChangeSummary(sync: EstimateScopeSync): string {
  const sections =
    sync.changedSections.length > 0 ? sync.changedSections.join(", ") : "wording only";
  return `Changed: ${sections} — this estimate used v${sync.sourceVersionNumber}`;
}
