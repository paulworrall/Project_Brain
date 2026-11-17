/**
 * FB-008: the Estimate step's specialist input tracker rows. (FB-011: the
 * per-step "Before you move on" readiness lists and their derived system
 * checks were removed; prerequisites are covered by the disabled-action notes,
 * the Next step banner and the Confirm scope dialog.) Pure, so it is shared by
 * the server (page data) and tests.
 */
import type { Capability } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";

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
