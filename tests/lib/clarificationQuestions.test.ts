import { describe, expect, it } from "vitest";
import { clarificationQuestionsFrom, completenessFromExtraction } from "@/lib/clarificationQuestions";
import { briefCompleteness, briefRecord, ALL_REQUIRED_CONFIRMED } from "../fixtures/briefCompleteness";

describe("clarificationQuestionsFrom", () => {
  it("asks each missing required detail's own question, in config order", () => {
    const { toAsk, toConfirm } = clarificationQuestionsFrom(briefCompleteness());

    expect(toAsk).toEqual([
      "Budget — What is the budget for the project?",
      "Objective — What is the objective of the project? Do we have OKRs/KPIs or measures we will measure the success of the project against?",
      "Timeline and Key Milestones — What is the expected timeline? What are the key milestones?",
      "Client Contact — Who is the client contact who will be running the project?",
    ]);
    expect(toConfirm).toEqual([]);
  });

  it("asks only for the missing sub-fields of a partial detail, and nothing once everything is confirmed", () => {
    const partial = clarificationQuestionsFrom(
      briefCompleteness([...ALL_REQUIRED_CONFIRMED.slice(0, 3), briefRecord("clientContact", { name: "Caroline" })])
    );
    expect(partial).toEqual({ toAsk: ["Client Contact — still need: Email"], toConfirm: [] });

    expect(clarificationQuestionsFrom(briefCompleteness([...ALL_REQUIRED_CONFIRMED]))).toEqual({
      toAsk: [],
      toConfirm: [],
    });
  });

  it("asks the client to confirm what was read from their own words, and never quotes the PM's suggestions", () => {
    const { toAsk, toConfirm } = clarificationQuestionsFrom(
      briefCompleteness([
        ...ALL_REQUIRED_CONFIRMED.filter((r) => r.attributeId !== "budget" && r.attributeId !== "objective"),
        briefRecord("budget", { amount: "40,000" }, { kind: "SUGGESTION", source: "BRIEF" }),
        briefRecord("objective", { successMeasures: "PM_ONLY_KPI" }, { kind: "SUGGESTION", source: "PM_ENTRY" }),
      ])
    );

    expect(toConfirm).toEqual(["Budget — we understood: Amount or range: 40,000"]);
    expect(toAsk).toContain("Budget — still need: Currency");
    expect([...toAsk, ...toConfirm].join(" ")).not.toContain("PM_ONLY_KPI");
  });
});

describe("completenessFromExtraction", () => {
  it("treats what intake just read as unconfirmed client suggestions", () => {
    const completeness = completenessFromExtraction({
      budget: { values: { amount: "50,000", currency: "GBP" }, evidence: "Budget: 50k" },
    });

    const budget = completeness.attributes.find((a) => a.id === "budget")!;
    expect(budget.status).toBe("missing");
    expect(budget.suggestion?.source).toBe("BRIEF");
    expect(completenessFromExtraction(null).requiredOutstanding).toHaveLength(4);
  });
});
