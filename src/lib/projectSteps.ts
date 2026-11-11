/**
 * FB-008: the three steps of the SOW journey — Brief → Estimate → SOW. This
 * replaces FB-007's 5D phase config (projectPhases.ts). Step status is derived
 * on read from plain data, so the same function runs on the server (redirects,
 * guards) and in the UI (the stepper). Nothing here is persisted.
 *
 * Each step's content component is mapped in the project layout (it needs
 * server data); `contentKey` names it so the mapping stays checkable.
 */
import { formatMoney } from "@/lib/formatMoney";

export type StepId = "brief" | "estimate" | "sow";
export type StepStatus = "not_started" | "in_progress" | "done";

/** What the status rules may look at. Plain data so it is shared by server and UI. */
export interface StepStatusInput {
  /** Project.scopeConfirmedAt (Date on the server, ISO string once serialised). */
  scopeConfirmedAt: Date | string | null;
  /** An estimate version is client approved (FB-005). */
  hasApprovedEstimate: boolean;
  /** Any estimate, estimate brief or specialist input exists. */
  hasEstimateWork: boolean;
  /** A SOW version is client approved (FB-005). */
  hasApprovedSow: boolean;
  /** Any SOW version exists. */
  hasSowVersion: boolean;
}

export interface StepDefinition {
  id: StepId;
  order: number;
  /** Stepper label. */
  label: string;
  /** The step content's heading. */
  heading: string;
  /** URL segment: /projects/[id]/<slug>. */
  slug: StepId;
  /** Key of the step's content component in the project layout. */
  contentKey: "BriefStep" | "EstimateStep" | "SowStep";
  deriveStatus: (project: StepStatusInput) => StepStatus;
}

export const PROJECT_STEPS: readonly StepDefinition[] = [
  {
    id: "brief",
    order: 1,
    label: "Brief",
    heading: "Brief",
    slug: "brief",
    contentKey: "BriefStep",
    // Projects start here, so Brief is never "not started".
    deriveStatus: (p) => (p.scopeConfirmedAt ? "done" : "in_progress"),
  },
  {
    id: "estimate",
    order: 2,
    label: "Estimate",
    heading: "Estimate",
    slug: "estimate",
    contentKey: "EstimateStep",
    deriveStatus: (p) =>
      p.hasApprovedEstimate ? "done" : p.hasEstimateWork ? "in_progress" : "not_started",
  },
  {
    id: "sow",
    order: 3,
    label: "SOW",
    heading: "Statement of Work",
    slug: "sow",
    contentKey: "SowStep",
    deriveStatus: (p) =>
      p.hasApprovedSow ? "done" : p.hasSowVersion ? "in_progress" : "not_started",
  },
];

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/** FB-007's 5D phase slugs. Old links to them redirect to the project's current step. */
export const RETIRED_PHASE_SLUGS: readonly string[] = [
  "discover",
  "define",
  "develop",
  "deliver",
  "dialogue",
];

export function isStepId(value: string): value is StepId {
  return PROJECT_STEPS.some((s) => s.id === value);
}

export function getStep(id: StepId): StepDefinition {
  const step = PROJECT_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step: ${id}`);
  return step;
}

/** Every step's status from one input. Pure — safe on server and client. */
export function deriveStepStatuses(project: StepStatusInput): Record<StepId, StepStatus> {
  return {
    brief: getStep("brief").deriveStatus(project),
    estimate: getStep("estimate").deriveStatus(project),
    sow: getStep("sow").deriveStatus(project),
  };
}

/** The first step that isn't Done — or `sow` once the project is complete (its SOW approved). */
export function getCurrentStepId(statuses: Record<StepId, StepStatus>): StepId {
  if (statuses.sow === "done") return "sow";
  return PROJECT_STEPS.find((s) => statuses[s.id] !== "done")?.id ?? "sow";
}

/** The project is complete once the SOW is client approved. */
export function isProjectComplete(statuses: Record<StepId, StepStatus>): boolean {
  return statuses.sow === "done";
}

// ---------------------------------------------------------------------------
// Done-step summaries ("Scope confirmed · 3 Nov") and their spoken versions.
// ---------------------------------------------------------------------------

export interface StepSummary {
  /** Visible one-liner. */
  text: string;
  /** Spoken form for the step link's accessible name ("approved 18 October, 45,675.00 US dollars"). */
  spoken: string;
  /** Download of the approved file (Estimate and SOW only). */
  downloadHref?: string;
  downloadLabel?: string;
}

/** Calendar dates (YYYY-MM-DD) and instants both format in UTC, so a date never shifts by a day. */
function toDate(value: Date | string): Date {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
}

export function shortDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(toDate(value));
}

export function longDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(toDate(value));
}

/** "45,675.00 US dollars" — the currency spoken in words. Falls back to the code. */
export function spokenMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      currencyDisplay: "name",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return formatMoney(amount, currency);
  }
}

export interface StepSummaryInput {
  scopeConfirmedAt: Date | string | null;
  approvedEstimate: {
    clientApprovedOn: string;
    total: number | null;
    currency: string | null;
    downloadHref: string;
    versionNumber: number;
  } | null;
  approvedSow: { clientApprovedOn: string; versionNumber: number; downloadHref: string } | null;
}

export function buildStepSummaries(input: StepSummaryInput): Partial<Record<StepId, StepSummary>> {
  const summaries: Partial<Record<StepId, StepSummary>> = {};
  if (input.scopeConfirmedAt) {
    summaries.brief = {
      text: `Scope confirmed · ${shortDate(input.scopeConfirmedAt)}`,
      spoken: `scope confirmed ${longDate(input.scopeConfirmedAt)}`,
    };
  }
  const est = input.approvedEstimate;
  if (est) {
    const hasTotal = est.total !== null && est.currency !== null;
    summaries.estimate = {
      text: `Approved ${shortDate(est.clientApprovedOn)}${hasTotal ? ` · ${formatMoney(est.total!, est.currency!)}` : ""}`,
      spoken: `approved ${longDate(est.clientApprovedOn)}${hasTotal ? `, ${spokenMoney(est.total!, est.currency!)}` : ""}`,
      downloadHref: est.downloadHref,
      downloadLabel: `Download approved estimate v${est.versionNumber}`,
    };
  }
  const sow = input.approvedSow;
  if (sow) {
    summaries.sow = {
      text: `Approved ${shortDate(sow.clientApprovedOn)} · v${sow.versionNumber}`,
      spoken: `approved ${longDate(sow.clientApprovedOn)}, version ${sow.versionNumber}`,
      downloadHref: sow.downloadHref,
      downloadLabel: `Download approved SOW v${sow.versionNumber}`,
    };
  }
  return summaries;
}

/** "Estimate, done, approved 18 October, 45,675.00 US dollars" / "SOW, in progress". */
export function stepAccessibleName(
  step: StepDefinition,
  status: StepStatus,
  summary?: StepSummary
): string {
  const base = `${step.label}, ${STEP_STATUS_LABEL[status].toLowerCase()}`;
  return status === "done" && summary ? `${base}, ${summary.spoken}` : base;
}

/** Shown when a step's prerequisite isn't met. No step is locked; its main action is disabled with this. */
export const STEP_PREREQUISITE_NOTE: Record<Exclude<StepId, "brief">, string> = {
  estimate: "The estimate is built from the confirmed scope. Confirm the scope in Brief first.",
  sow: "The SOW is generated from the approved estimate. Approve the estimate first.",
};

export const PROJECT_COMPLETE_MESSAGE =
  "This project is complete. Changes will need a change request (coming soon).";
