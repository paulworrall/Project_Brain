import {
  evaluateBriefCompleteness,
  type BriefAttributeValueRecord,
  type BriefCompleteness,
} from "@/lib/briefCompleteness";

// Real BriefCompleteness objects for component tests — built with the real
// status logic rather than hand-written shapes, so they can't drift.

let seq = 0;
export function briefRecord(
  attributeId: string,
  values: Record<string, unknown>,
  overrides: Partial<BriefAttributeValueRecord> = {}
): BriefAttributeValueRecord {
  seq += 1;
  return {
    id: `fixture_${seq}`,
    attributeId,
    kind: "CONFIRMED",
    source: "PM_ENTRY",
    values,
    evidence: null,
    createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, seq)),
    createdByName: "Pat PM",
    ...overrides,
  };
}

export const ALL_REQUIRED_CONFIRMED: BriefAttributeValueRecord[] = [
  briefRecord("budget", { amount: "£50,000", currency: "GBP" }),
  briefRecord("objective", { objective: "Relaunch the app", successMeasures: "20% more actives" }),
  briefRecord("timeline", { startDate: "2026-10-01" }),
  briefRecord("clientContact", { name: "Caroline", email: "caroline@fizzy.example" }),
];

export function briefCompleteness(
  records: BriefAttributeValueRecord[] = [],
  currentStageNumber = 3
): BriefCompleteness {
  return evaluateBriefCompleteness(records, { currentStageNumber });
}
