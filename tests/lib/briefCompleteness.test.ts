import { describe, expect, it } from "vitest";
import { evaluateBriefCompleteness, type BriefAttributeValueRecord } from "@/lib/briefCompleteness";
import { REQUIRED_BRIEF_ATTRIBUTES } from "@/lib/briefAttributes";

let seq = 0;
function record(
  attributeId: string,
  values: Record<string, unknown>,
  overrides: Partial<BriefAttributeValueRecord> = {}
): BriefAttributeValueRecord {
  seq += 1;
  return {
    id: `rec_${seq}`,
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

const FULL_CONFIRMED = [
  record("budget", { amount: "£40,000–£50,000", currency: "GBP" }),
  record("objective", {
    objective: "Relaunch the loyalty app",
    successMeasures: "20% more monthly actives",
  }),
  record("timeline", { startDate: "2026-10-01", endDate: null, milestones: [] }),
  record("clientContact", { name: "Caroline", role: null, email: "caroline@fizzy.example" }),
];

const IN_PHASE_1 = { currentStageNumber: 3 };

function statusOf(result: ReturnType<typeof evaluateBriefCompleteness>, id: string) {
  return result.attributes.find((a) => a.id === id)!;
}

describe("evaluateBriefCompleteness — status per attribute", () => {
  it.each(REQUIRED_BRIEF_ATTRIBUTES.map((a) => a.id))(
    "%s is missing with no values at all",
    (id) => {
      const attribute = statusOf(evaluateBriefCompleteness([], IN_PHASE_1), id);
      expect(attribute.status).toBe("missing");
      expect(attribute.confirmed).toBeNull();
    }
  );

  it.each([
    ["budget", { amount: "£50k", currency: null }, ["Currency"]],
    ["objective", { objective: "Relaunch", successMeasures: "" }, ["Success measures (OKRs/KPIs)"]],
    ["timeline", { startDate: null, endDate: "2026-12-01", milestones: [] }, ["Start date"]],
    ["clientContact", { name: "Caroline", role: "Marketing lead", email: null }, ["Email"]],
  ] as const)(
    "%s is partial when only some required sub-fields are filled",
    (id, values, missing) => {
      const attribute = statusOf(evaluateBriefCompleteness([record(id, values)], IN_PHASE_1), id);
      expect(attribute.status).toBe("partial");
      expect(attribute.missingSubFields.map((f) => f.label)).toEqual(missing);
    }
  );

  it.each(FULL_CONFIRMED.map((r) => [r.attributeId, r] as const))(
    "%s is confirmed once a PM confirms every required sub-field",
    (id, rec) => {
      const attribute = statusOf(evaluateBriefCompleteness([rec], IN_PHASE_1), id);
      expect(attribute.status).toBe("confirmed");
      expect(attribute.missingSubFields).toEqual([]);
    }
  );

  it("doesn't need optional sub-fields (end date, milestones, role) to be confirmed", () => {
    const result = evaluateBriefCompleteness(FULL_CONFIRMED, IN_PHASE_1);
    expect(statusOf(result, "timeline").status).toBe("confirmed");
    expect(statusOf(result, "clientContact").status).toBe("confirmed");
  });

  it("uses the latest confirmed values, and records where they came from and when", () => {
    const older = record("budget", { amount: "£50k", currency: null });
    const newer = record("budget", { amount: "£60k", currency: "GBP" }, { source: "BRIEF" });
    const attribute = statusOf(evaluateBriefCompleteness([newer, older], IN_PHASE_1), "budget");
    expect(attribute.status).toBe("confirmed");
    expect(attribute.confirmed?.values.amount).toBe("£60k");
    expect(attribute.confirmed?.source).toBe("BRIEF");
    expect(attribute.confirmed?.createdAt).toEqual(newer.createdAt);
    expect(attribute.confirmed?.createdByName).toBe("Pat PM");
  });
});

describe("evaluateBriefCompleteness — AI suggestions", () => {
  it("keeps a complete AI-extracted value as a suggestion, never counting it as confirmed", () => {
    const suggestion = record(
      "budget",
      { amount: "£50k", currency: "GBP" },
      { kind: "SUGGESTION", source: "BRIEF", evidence: "Budget is £50k", createdByName: null }
    );
    const result = evaluateBriefCompleteness([suggestion], IN_PHASE_1);
    const budget = statusOf(result, "budget");

    expect(budget.status).toBe("missing");
    expect(budget.confirmed).toBeNull();
    expect(budget.suggestion).toMatchObject({
      id: suggestion.id,
      source: "BRIEF",
      evidence: "Budget is £50k",
      values: { amount: "£50k", currency: "GBP" },
    });
    expect(result.canProceed).toBe(false);
  });

  it("shows a suggestion newer than the confirmed value, without changing the confirmed status", () => {
    const confirmed = record("budget", { amount: "£50k", currency: "GBP" });
    const newerSuggestion = record(
      "budget",
      { amount: "£65k", currency: "GBP" },
      { kind: "SUGGESTION", source: "UPDATE" }
    );
    const budget = statusOf(
      evaluateBriefCompleteness([confirmed, newerSuggestion], IN_PHASE_1),
      "budget"
    );
    expect(budget.status).toBe("confirmed");
    expect(budget.confirmed?.values.amount).toBe("£50k");
    expect(budget.suggestion?.values.amount).toBe("£65k");
  });

  it("drops a suggestion once a PM confirms after it", () => {
    const suggestion = record(
      "budget",
      { amount: "£50k", currency: "GBP" },
      { kind: "SUGGESTION", source: "BRIEF" }
    );
    const confirmed = record("budget", { amount: "£50k", currency: "GBP" }, { source: "BRIEF" });
    const budget = statusOf(
      evaluateBriefCompleteness([suggestion, confirmed], IN_PHASE_1),
      "budget"
    );
    expect(budget.status).toBe("confirmed");
    expect(budget.suggestion).toBeNull();
  });
});

describe("evaluateBriefCompleteness — the gate", () => {
  it("blocks when any required attribute isn't confirmed, listing exactly what's missing or partial", () => {
    const result = evaluateBriefCompleteness(
      [
        FULL_CONFIRMED[0], // budget confirmed
        record("objective", { objective: "Relaunch", successMeasures: null }), // partial
        // timeline: nothing
        record(
          "clientContact",
          { name: "Caroline", email: "c@fizzy.example" },
          { kind: "SUGGESTION" }
        ), // suggestion only
      ],
      IN_PHASE_1
    );

    expect(result.canProceed).toBe(false);
    expect(result.allRequiredConfirmed).toBe(false);
    expect(result.requiredOutstanding.map((a) => [a.id, a.status])).toEqual([
      ["objective", "partial"],
      ["timeline", "missing"],
      ["clientContact", "missing"],
    ]);
  });

  it("allows proceeding once all 4 required attributes are confirmed", () => {
    const result = evaluateBriefCompleteness(FULL_CONFIRMED, IN_PHASE_1);
    expect(result.canProceed).toBe(true);
    expect(result.allRequiredConfirmed).toBe(true);
    expect(result.requiredOutstanding).toEqual([]);
  });

  it("never lets optional attributes affect canProceed", () => {
    const withoutOptional = evaluateBriefCompleteness(FULL_CONFIRMED, IN_PHASE_1);
    const withPartialOptional = evaluateBriefCompleteness(
      [...FULL_CONFIRMED, record("markets", { markets: "" })],
      IN_PHASE_1
    );
    expect(statusOf(withoutOptional, "scope").status).toBe("missing");
    expect(withoutOptional.canProceed).toBe(true);
    expect(withPartialOptional.canProceed).toBe(true);
    expect(withPartialOptional.requiredOutstanding).toEqual([]);

    const blocked = evaluateBriefCompleteness(
      [...FULL_CONFIRMED.slice(1), record("scope", { description: "Loyalty app redesign" })],
      IN_PHASE_1
    );
    expect(statusOf(blocked, "scope").status).toBe("confirmed");
    expect(blocked.canProceed).toBe(false);
  });

  it("ignores stored values for attribute ids no longer in the config", () => {
    const result = evaluateBriefCompleteness(
      [...FULL_CONFIRMED, record("retiredAttribute", { x: "y" })],
      IN_PHASE_1
    );
    expect(result.attributes.find((a) => a.id === "retiredAttribute")).toBeUndefined();
    expect(result.canProceed).toBe(true);
  });
});

describe("evaluateBriefCompleteness — existing projects past Phase 1", () => {
  it("gives a project already past Phase 1 a warning per missing required attribute, not a lock-out", () => {
    const result = evaluateBriefCompleteness([FULL_CONFIRMED[0]], { currentStageNumber: 6 });
    expect(result.isPastPhase1).toBe(true);
    expect(result.warnings).toEqual([
      "Objective is missing",
      "Timeline and Key Milestones is missing",
      "Client Contact is missing",
    ]);
  });

  it("has no warnings once everything required is confirmed", () => {
    expect(evaluateBriefCompleteness(FULL_CONFIRMED, { currentStageNumber: 6 }).warnings).toEqual(
      []
    );
  });

  it("doesn't raise warnings for a project still in Phase 1 — the outstanding list covers it there", () => {
    const result = evaluateBriefCompleteness([], IN_PHASE_1);
    expect(result.isPastPhase1).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.requiredOutstanding).toHaveLength(4);
  });
});
