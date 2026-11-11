/**
 * FB-008: each step's "Before you move on" list — the PM's checklist items
 * for that step plus derived, read-only system checks. Pure, so it is shared
 * by the server (page data) and tests.
 */
import type { Capability } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { StepId } from "@/lib/projectSteps";

export interface SystemCheck {
  id: string;
  label: string;
  met: boolean;
}

export interface SystemCheckInput {
  briefSubmitted: boolean;
  hasMasterServiceAgreement: boolean;
  hasRateCard: boolean;
  scopeConfirmed: boolean;
  confirmedCapabilityCount: number;
  estimateApproved: boolean;
  /** The latest SOW version was generated from the approved estimate version. */
  sowFromApprovedEstimate: boolean;
}

export function buildSystemChecks(input: SystemCheckInput): Record<StepId, SystemCheck[]> {
  return {
    brief: [
      { id: "brief-submitted", label: "Brief submitted", met: input.briefSubmitted },
      {
        id: "msa-rate-card",
        label: "MSA and rate card set on the project",
        met: input.hasMasterServiceAgreement && input.hasRateCard,
      },
    ],
    estimate: [
      { id: "scope-confirmed", label: "Scope confirmed", met: input.scopeConfirmed },
      {
        id: "capability-confirmed",
        label: "At least one capability confirmed",
        met: input.confirmedCapabilityCount > 0,
      },
    ],
    sow: [
      { id: "estimate-approved", label: "Estimate approved", met: input.estimateApproved },
      {
        id: "sow-from-approved-estimate",
        label: "SOW generated from the approved estimate",
        met: input.sowFromApprovedEstimate,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Specialist input tracker rows
// ---------------------------------------------------------------------------

export type SpecialistInputStatusName = "not_requested" | "requested" | "received";

export const SPECIALIST_STATUS_LABEL: Record<SpecialistInputStatusName, string> = {
  not_requested: "Not requested",
  requested: "Requested",
  received: "Received",
};

export interface SpecialistInputRecord {
  capability: Capability;
  status: SpecialistInputStatusName;
  note: string | null;
}

export interface SpecialistRow {
  capability: Capability;
  label: string;
  status: SpecialistInputStatusName;
  note: string | null;
}

/**
 * One row per confirmed capability, in the confirmed order. A capability
 * without a stored row is "Not requested"; stored rows for capabilities that
 * are no longer confirmed are left out (hidden, not deleted).
 */
export function buildSpecialistRows(
  confirmedCapabilities: readonly Capability[],
  inputs: readonly SpecialistInputRecord[]
): SpecialistRow[] {
  const byCapability = new Map(inputs.map((i) => [i.capability, i]));
  return confirmedCapabilities.map((capability) => {
    const stored = byCapability.get(capability);
    return {
      capability,
      label: capabilityLabel(capability),
      status: stored?.status ?? "not_requested",
      note: stored?.note ?? null,
    };
  });
}

/** "2 of 3 specialist inputs received". */
export function specialistHeader(rows: readonly SpecialistRow[]): string {
  const received = rows.filter((r) => r.status === "received").length;
  return `${received} of ${rows.length} specialist input${rows.length === 1 ? "" : "s"} received`;
}
