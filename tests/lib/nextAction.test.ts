import { describe, expect, it } from "vitest";
import { deriveNextAction, type NextActionId, type NextActionInput } from "@/lib/nextAction";

/** A project that has done everything except the SOW approval. */
const done: NextActionInput = {
  projectId: "p1",
  projectComplete: false,
  approvedSowHref: null,
  hasScopeSummary: true,
  hasEarlierDocuments: false,
  openQuestions: 0,
  clarificationSent: true,
  briefAssessment: null,
  scopeConfirmed: true,
  scopeNewerThanConfirmed: false,
  capabilityCount: 2,
  hasEstimateBrief: true,
  specialistReceived: 2,
  specialistTotal: 2,
  hasEstimate: true,
  estimateStale: false,
  estimateApproved: true,
  hasSow: true,
  sowStale: false,
  sowApproved: false,
};

const id = (overrides: Partial<NextActionInput>): NextActionId =>
  deriveNextAction({ ...done, ...overrides }).id;

describe("deriveNextAction — each rule", () => {
  it.each<[NextActionId, Partial<NextActionInput>]>([
    ["complete", { projectComplete: true, sowApproved: true, approvedSowHref: "/api/sow/1" }],
    ["create_scope_summary", { hasScopeSummary: false, hasEarlierDocuments: true }],
    [
      "send_clarification",
      {
        openQuestions: 2,
        clarificationSent: false,
        scopeConfirmed: false,
        estimateApproved: false,
      },
    ],
    ["confirm_scope", { scopeConfirmed: false, estimateApproved: false }],
    ["confirm_latest_scope", { scopeNewerThanConfirmed: true, estimateApproved: false }],
    ["choose_capabilities", { capabilityCount: 0, estimateApproved: false, hasEstimate: false }],
    [
      "prepare_estimate_brief",
      { hasEstimateBrief: false, estimateApproved: false, hasEstimate: false },
    ],
    [
      "wait_specialists",
      { specialistReceived: 1, specialistTotal: 3, hasEstimate: false, estimateApproved: false },
    ],
    ["build_estimate", { hasEstimate: false, estimateApproved: false }],
    ["review_estimate", { estimateStale: true, estimateApproved: false }],
    ["approve_estimate", { estimateApproved: false }],
    ["generate_sow", { hasSow: false }],
    ["generate_sow", { sowStale: true }],
    ["approve_sow", {}],
  ])("%s", (expected, overrides) => {
    expect(id(overrides)).toBe(expected);
  });

  it("always returns exactly one action with a title, reason and button", () => {
    const action = deriveNextAction({
      ...done,
      specialistReceived: 1,
      specialistTotal: 3,
      hasEstimate: false,
      estimateApproved: false,
    });
    expect(action).toEqual({
      id: "wait_specialists",
      title: "Waiting on 2 of 3 specialist inputs",
      reason: expect.any(String),
      step: "estimate",
      button: { label: "Open the tracker", href: "/projects/p1/estimate#specialist-inputs" },
    });
  });

  it("links the complete state to the approved SOW download", () => {
    expect(
      deriveNextAction({ ...done, projectComplete: true, approvedSowHref: "/api/x" }).button
    ).toEqual({
      label: "Download the approved SOW",
      href: "/api/x",
    });
  });
});

describe("deriveNextAction — ordering (first match wins)", () => {
  const fresh: Partial<NextActionInput> = {
    openQuestions: 3,
    clarificationSent: false,
    scopeConfirmed: false,
    capabilityCount: 0,
    hasEstimateBrief: false,
    specialistReceived: 0,
    specialistTotal: 0,
    hasEstimate: false,
    estimateApproved: false,
    hasSow: false,
  };

  it("walks a new project through the journey in order", () => {
    let state: Partial<NextActionInput> = { ...fresh };
    const seen: NextActionId[] = [];
    const advance: Record<string, Partial<NextActionInput>> = {
      send_clarification: { clarificationSent: true },
      confirm_scope: { scopeConfirmed: true },
      choose_capabilities: { capabilityCount: 2, specialistTotal: 2 },
      prepare_estimate_brief: { hasEstimateBrief: true },
      wait_specialists: { specialistReceived: 2 },
      build_estimate: { hasEstimate: true },
      approve_estimate: { estimateApproved: true },
      generate_sow: { hasSow: true },
      approve_sow: { sowApproved: true, projectComplete: true },
    };
    for (let i = 0; i < 12; i++) {
      const next = id(state);
      seen.push(next);
      if (next === "complete") break;
      state = { ...state, ...advance[next] };
    }
    expect(seen).toEqual([
      "send_clarification",
      "confirm_scope",
      "choose_capabilities",
      "prepare_estimate_brief",
      "wait_specialists",
      "build_estimate",
      "approve_estimate",
      "generate_sow",
      "approve_sow",
      "complete",
    ]);
  });

  it("once the estimate is approved, earlier gaps don't hold up the SOW (legacy projects)", () => {
    expect(
      id({
        scopeConfirmed: false,
        capabilityCount: 0,
        hasEstimateBrief: false,
        openQuestions: 3,
        clarificationSent: false,
        hasSow: false,
      })
    ).toBe("generate_sow");
  });

  it("complete wins over everything", () => {
    expect(id({ ...fresh, projectComplete: true })).toBe("complete");
  });

  it("a legacy project must create its scope summary before anything else", () => {
    expect(id({ ...fresh, hasScopeSummary: false, hasEarlierDocuments: true })).toBe(
      "create_scope_summary"
    );
  });

  it("open questions stop mattering once the scope is confirmed", () => {
    expect(id({ openQuestions: 4, clarificationSent: false })).toBe("approve_sow");
  });

  it("a stale estimate is reviewed before approval, but an approved one isn't", () => {
    expect(id({ estimateStale: true, estimateApproved: false })).toBe("review_estimate");
    expect(id({ estimateStale: true, estimateApproved: true })).toBe("approve_sow");
  });

  it("a newer unconfirmed scope is ignored once the estimate is approved (change request)", () => {
    expect(id({ scopeNewerThanConfirmed: true, estimateApproved: true })).toBe("approve_sow");
  });

  it("once an estimate exists, missing capabilities or estimate brief don't come first", () => {
    expect(id({ estimateApproved: false, capabilityCount: 0, hasEstimateBrief: false })).toBe(
      "approve_estimate"
    );
  });

  it("specialist waiting only applies before any estimate exists (not a gate)", () => {
    expect(id({ specialistReceived: 0, specialistTotal: 3, hasEstimate: true })).toBe(
      "approve_sow"
    );
  });

  it("a complete brief goes straight to confirming the scope (fast path)", () => {
    expect(id({ ...fresh, briefAssessment: "complete" })).toBe("confirm_scope");
    expect(id({ ...fresh, briefAssessment: "thin" })).toBe("send_clarification");
  });
});
