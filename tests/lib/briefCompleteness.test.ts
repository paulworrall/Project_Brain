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
  record("budget", { amount: "£40,000–£50,000" }),
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
      expect(attribute.current).toBeNull();
    }
  );

  it.each([
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
    "%s is captured once every required sub-field is filled",
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

  it("reads a budget stored as a separate amount and currency as one free-text value", () => {
    const legacy = record("budget", { amount: "roughly €110,000", currency: "EUR" });
    const budget = statusOf(evaluateBriefCompleteness([legacy], IN_PHASE_1), "budget");
    expect(budget.status).toBe("confirmed");
    expect(budget.current?.values).toEqual({ amount: "roughly €110,000 (EUR)" });

    const alreadyIncluded = record("budget", { amount: "EUR 110,000", currency: "EUR" });
    expect(
      statusOf(evaluateBriefCompleteness([alreadyIncluded], IN_PHASE_1), "budget").current?.values
    ).toEqual({ amount: "EUR 110,000" });
  });
});

describe("evaluateBriefCompleteness — trusted by default, latest wins", () => {
  it("counts a value the agent captured from the brief straight away — no approval step", () => {
    const captured = record(
      "budget",
      { amount: "£50k" },
      { kind: "SUGGESTION", source: "BRIEF", evidence: "Budget is £50k", createdByName: null }
    );
    const result = evaluateBriefCompleteness([captured], IN_PHASE_1);
    const budget = statusOf(result, "budget");

    expect(budget.status).toBe("confirmed");
    expect(budget.current).toMatchObject({
      id: captured.id,
      origin: { kind: "brief" },
      evidence: "Budget is £50k",
      values: { amount: "£50k" },
    });
  });

  it("lets newer information replace a PM's edit, and a PM's edit replace captured values", () => {
    const pmEdit = record("budget", { amount: "£50k" });
    const update = record(
      "budget",
      { amount: "£65k" },
      { kind: "SUGGESTION", source: "UPDATE", knowledgeItemId: "ki_2" }
    );
    const updated = statusOf(
      evaluateBriefCompleteness([pmEdit, update], IN_PHASE_1, new Map([["ki_1", 1], ["ki_2", 2]])),
      "budget"
    );
    expect(updated.current?.values.amount).toBe("£65k");
    expect(updated.current?.origin).toEqual({ kind: "update", number: 2 });

    const laterEdit = record("budget", { amount: "£70k" });
    const edited = statusOf(evaluateBriefCompleteness([pmEdit, update, laterEdit], IN_PHASE_1), "budget");
    expect(edited.current?.values.amount).toBe("£70k");
    expect(edited.current?.origin).toEqual({ kind: "pm" });
    expect(edited.current?.createdByName).toBe("Pat PM");
  });

  it("returns a detail to missing when a PM saves it empty", () => {
    const captured = record("budget", { amount: "£50k" }, { kind: "SUGGESTION", source: "BRIEF" });
    const cleared = record("budget", { amount: null });
    const budget = statusOf(evaluateBriefCompleteness([captured, cleared], IN_PHASE_1), "budget");
    expect(budget.status).toBe("missing");
    expect(budget.current?.origin).toEqual({ kind: "pm" });
  });

  it("tags an update whose number can't be told as just 'an update'", () => {
    const update = record("budget", { amount: "£65k" }, { kind: "SUGGESTION", source: "UPDATE" });
    expect(statusOf(evaluateBriefCompleteness([update], IN_PHASE_1), "budget").current?.origin).toEqual({
      kind: "update",
      number: null,
    });
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
          { kind: "SUGGESTION", source: "BRIEF" }
        ), // captured from the brief — counts
      ],
      IN_PHASE_1
    );

    expect(result.canProceed).toBe(false);
    expect(result.allRequiredConfirmed).toBe(false);
    expect(result.requiredOutstanding.map((a) => [a.id, a.status])).toEqual([
      ["objective", "partial"],
      ["timeline", "missing"],
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

describe("evaluateBriefCompleteness — leftover PM perspective suggestions", () => {
  it("ignores an old PM-perspective suggestion row, even when it's the newest", () => {
    const fromBrief = record(
      "objective",
      { objective: "Relaunch the app", successMeasures: "Client KPI: 10k downloads" },
      { kind: "SUGGESTION", source: "BRIEF" }
    );
    const leftover = record(
      "objective",
      { objective: null, successMeasures: "PM view: 20% more monthly actives" },
      { kind: "SUGGESTION", source: "PM_ENTRY" }
    );

    const objective = statusOf(evaluateBriefCompleteness([fromBrief, leftover], IN_PHASE_1), "objective");

    expect(objective.status).toBe("confirmed");
    expect(objective.current?.source).toBe("BRIEF");
    expect(objective.current?.values.successMeasures).toBe("Client KPI: 10k downloads");
  });
});
