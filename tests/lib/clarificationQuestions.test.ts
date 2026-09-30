import { describe, expect, it } from "vitest";
import { clarificationQuestionsFrom, completenessFromExtraction } from "@/lib/clarificationQuestions";
import { briefCompleteness, briefRecord, ALL_REQUIRED_CONFIRMED } from "../fixtures/briefCompleteness";
import { evaluateBriefCompleteness } from "@/lib/briefCompleteness";

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

  it("asks only for the missing sub-fields of a partial detail, and nothing once a PM has filled everything", () => {
    const partial = clarificationQuestionsFrom(
      briefCompleteness([...ALL_REQUIRED_CONFIRMED.slice(0, 3), briefRecord("clientContact", { name: "Caroline" })])
    );
    expect(partial).toEqual({ toAsk: ["Client Contact — still need: Email"], toConfirm: [] });

    expect(clarificationQuestionsFrom(briefCompleteness([...ALL_REQUIRED_CONFIRMED]))).toEqual({
      toAsk: [],
      toConfirm: [],
    });
  });

  it("asks the client to confirm what was captured from their own words, and never quotes the PM", () => {
    const { toAsk, toConfirm } = clarificationQuestionsFrom(
      briefCompleteness([
        ...ALL_REQUIRED_CONFIRMED.filter((r) => r.attributeId !== "budget" && r.attributeId !== "clientContact"),
        briefRecord("budget", { amount: "roughly €40,000" }, { kind: "SUGGESTION", source: "BRIEF" }),
        briefRecord("clientContact", { name: "Caroline" }, { kind: "SUGGESTION", source: "UPDATE" }),
        briefRecord("objective", { successMeasures: "PM_ONLY_KPI" }, { kind: "SUGGESTION", source: "PM_ENTRY" }),
      ])
    );

    expect(toConfirm).toEqual([
      "Budget — we understood: Budget: roughly €40,000",
      "Client Contact — we understood: Name: Caroline",
    ]);
    expect(toAsk).toEqual(["Client Contact — still need: Email"]);
    expect([...toAsk, ...toConfirm].join(" ")).not.toContain("PM_ONLY_KPI");
  });
});

describe("clarificationQuestionsFrom — internal-team updates", () => {
  it("never asks the client to confirm what our own team told us, but doesn't ask for it either", () => {
    const internal = briefRecord(
      "budget",
      { amount: "INTERNAL_BUDGET" },
      { kind: "SUGGESTION", source: "UPDATE", knowledgeItemId: "ki_internal" }
    );
    const fromClient = briefRecord(
      "clientContact",
      { name: "Caroline", email: "caroline@fizzy.example" },
      { kind: "SUGGESTION", source: "UPDATE", knowledgeItemId: "ki_client" }
    );
    const completeness = evaluateBriefCompleteness(
      [...ALL_REQUIRED_CONFIRMED.filter((r) => r.attributeId !== "budget" && r.attributeId !== "clientContact"), internal, fromClient],
      { currentStageNumber: 3 },
      new Map([
        ["ki_internal", { number: 3, internalTeam: true }],
        ["ki_client", { number: 2, internalTeam: false }],
      ])
    );

    const { toAsk, toConfirm } = clarificationQuestionsFrom(completeness);
    expect(toConfirm).toEqual(["Client Contact — we understood: Name: Caroline · Email: caroline@fizzy.example"]);
    expect(toAsk).toEqual([]);
    expect([...toAsk, ...toConfirm].join(" ")).not.toContain("INTERNAL_BUDGET");
  });
});

describe("completenessFromExtraction", () => {
  it("treats what intake just read as captured from the brief", () => {
    const completeness = completenessFromExtraction({
      budget: { values: { amount: "50,000 GBP" }, evidence: "Budget: 50k" },
    });

    const budget = completeness.attributes.find((a) => a.id === "budget")!;
    expect(budget.status).toBe("confirmed");
    expect(budget.current?.origin).toEqual({ kind: "brief" });
    expect(clarificationQuestionsFrom(completeness).toConfirm).toEqual([
      "Budget — we understood: Budget: 50,000 GBP",
    ]);
    expect(completenessFromExtraction(null).requiredOutstanding).toHaveLength(4);
  });
});
