import type { Capability } from "@/generated/prisma/enums";
import { capabilityCode } from "@/lib/mapCapabilities";

/**
 * SOW ↔ estimate sync — the pure half (no database), safe for client
 * components. The single source of truth is getSowSyncStatus
 * (src/lib/sowSync.ts), which builds these; no surface works out staleness
 * on its own.
 *
 * A SOW version is pinned to the exact estimate version its commercials came
 * from. It's in sync while that's still the estimate's latest version, stale
 * once the estimate has a newer one, and unlinked when its source isn't
 * known (made before the link existed and not backfilled). Derived at read
 * time by comparing version ids — never stored.
 */
export type SowSyncState = "in_sync" | "stale" | "unlinked";

export interface EstimateVersionRef {
  estimateVersionId: string;
  estimateId: string;
  estimateLabel: string;
  versionNumber: number;
  total: number;
  currency: string;
  capabilities: Capability[];
}

export interface SowSyncDiff {
  /** current − source, in the shared currency; null when the currency changed. */
  totalDelta: number | null;
  currencyChange: { from: string; to: string } | null;
  capabilitiesAdded: Capability[];
  capabilitiesRemoved: Capability[];
}

export interface SowSyncStatus {
  sowVersionId: string;
  sowVersionNumber: number;
  status: SowSyncState;
  /** What the SOW version was built from (its snapshot), or null if unknown. */
  source: EstimateVersionRef | null;
  /** The latest version of the estimate the SOW is pinned to. */
  current: EstimateVersionRef | null;
  diff: SowSyncDiff | null;
}

export interface SowVersionSourceLabel {
  sowVersionId: string;
  sowVersionNumber: number;
  /** e.g. "SOW v2 — from Estimate v1 — 50,400 USD", or "SOW v1 — source unknown". */
  label: string;
  status: SowSyncState;
  /** The estimate version it came from, for the download guard's wording. */
  sourceVersionNumber?: number | null;
}

export interface ProjectSowSync {
  /** The latest SOW version's sync status; null if there's no SOW yet. */
  sow: SowSyncStatus | null;
  /** Every SOW version, newest first, labelled with its source. */
  versions: SowVersionSourceLabel[];
  /** The latest SOW is stale or unlinked — drives the Phase 3 header indicator. */
  needsAttention: boolean;
}

export function evaluateSowSync({
  sowVersionId,
  sowVersionNumber,
  source,
  current,
}: {
  sowVersionId: string;
  sowVersionNumber: number;
  source: EstimateVersionRef | null;
  current: EstimateVersionRef | null;
}): SowSyncStatus {
  if (!source || !current) {
    return { sowVersionId, sowVersionNumber, status: "unlinked", source, current, diff: null };
  }
  if (current.estimateVersionId === source.estimateVersionId) {
    return { sowVersionId, sowVersionNumber, status: "in_sync", source, current, diff: null };
  }
  const currencyChanged = current.currency !== source.currency;
  return {
    sowVersionId,
    sowVersionNumber,
    status: "stale",
    source,
    current,
    diff: {
      totalDelta: currencyChanged ? null : Math.round((current.total - source.total) * 100) / 100,
      currencyChange: currencyChanged ? { from: source.currency, to: current.currency } : null,
      capabilitiesAdded: current.capabilities.filter((c) => !source.capabilities.includes(c)),
      capabilitiesRemoved: source.capabilities.filter((c) => !current.capabilities.includes(c)),
    },
  };
}

const WHOLE = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const PENCE = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "50,400 USD", or "1,234.50 GBP" when there are pence. */
export function formatMoney(amount: number, currency: string): string {
  return `${(Number.isInteger(amount) ? WHOLE : PENCE).format(amount)} ${currency}`;
}

function signedMoney(amount: number, currency: string): string {
  return `${amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(amount), currency)}`;
}

/** e.g. "SOW v2 is based on Estimate v1 — 50,400 USD. Latest estimate is v3 — 93,000 USD (+42,600 USD). Capabilities added: TSC, AIAE." */
export function sowSyncBannerText(sync: SowSyncStatus): string {
  if (sync.status !== "stale" || !sync.source || !sync.current || !sync.diff) return "";
  const { source, current, diff } = sync;
  const change = diff.currencyChange
    ? ` (currency changed from ${diff.currencyChange.from} to ${diff.currencyChange.to})`
    : ` (${signedMoney(diff.totalDelta ?? 0, current.currency)})`;
  const parts = [
    `SOW v${sync.sowVersionNumber} is based on Estimate v${source.versionNumber} — ${formatMoney(source.total, source.currency)}.`,
    `Latest estimate is v${current.versionNumber} — ${formatMoney(current.total, current.currency)}${change}.`,
  ];
  if (diff.capabilitiesAdded.length > 0) {
    parts.push(`Capabilities added: ${diff.capabilitiesAdded.map(capabilityCode).join(", ")}.`);
  }
  if (diff.capabilitiesRemoved.length > 0) {
    parts.push(`Capabilities removed: ${diff.capabilitiesRemoved.map(capabilityCode).join(", ")}.`);
  }
  return parts.join(" ");
}

/** "SOW v2 — from Estimate v1 — 50,400 USD", or "SOW v1 — source unknown". */
export function sowVersionSourceLabel({
  sowVersionNumber,
  source,
}: {
  sowVersionNumber: number;
  source: Pick<EstimateVersionRef, "versionNumber" | "total" | "currency"> | null;
}): string {
  return source
    ? `SOW v${sowVersionNumber} — from Estimate v${source.versionNumber} — ${formatMoney(source.total, source.currency)}`
    : `SOW v${sowVersionNumber} — source unknown`;
}

/** The download guard's question for a stale SOW version, or null if no guard is needed. */
export function staleDownloadWarning(
  status: SowSyncState | undefined,
  sourceVersionNumber: number | null | undefined
): string | null {
  if (status !== "stale") return null;
  return sourceVersionNumber != null
    ? `This SOW reflects an older estimate (v${sourceVersionNumber}).`
    : "This SOW reflects an older estimate.";
}
