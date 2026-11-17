import { describe, expect, it } from "vitest";
import { deriveNextAction, type NextActionId, type NextActionInput } from "@/lib/nextAction";

/** A project that has done everything except the SOW approval. */
const done: NextActionInput = {
  projectId: "p1",
  clientId: "c1",
  clientName: "Fizzy",
  projectComplete: false,
  approvedSowHref: null,
  hasScopeSummary: true,
  hasEarlierDocuments: false,
  openQuestions: 0,
  hasMsaAndRateCard: true,
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
    ["add_msa_rate_card", { hasMsaAndRateCard: false, estimateApproved: false, hasEstimate: false }],
    [
      "resolve_questions",
      { openQuestions: 2, scopeConfirmed: false, estimateApproved: false },
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

  it("asks for the MSA and rate card first, linking to the client page (FB-011)", () => {
    expect(deriveNextAction({
        ...done,
        hasMsaAndRateCard: false,
        estimateApproved: false,
        hasEstimate: false,
      })
    ).toEqual({
      id: "add_msa_rate_card",
      title: "Add an MSA and rate card for Fizzy",
      reason: "An Admin needs to add these before the estimate can be priced.",
      step: "brief",
      button: { label: "Open the client page", href: "/clients/c1" },
    });
  });

  it("resolve_questions counts the questions and its button copies them (FB-011)", () => {
    expect(
      deriveNextAction({ ...done, openQuestions: 4, scopeConfirmed: false, estimateApproved: false })
    ).toEqual({
      id: "resolve_questions",
      title: "Resolve open questions with the client",
      reason: "4 open questions in the scope summary. Tell the assistant the answers when you have them.",
      step: "brief",
      button: {
        label: "Copy questions",
        href: "/projects/p1/brief#scope-summary",
        action: "copy_questions",
      },
    });
    expect(
      deriveNextAction({ ...done, openQuestions: 1, scopeConfirmed: false, estimateApproved: false })
        .reason
    ).toBe("1 open question in the scope summary. Tell the assistant the answers when you have them.");
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
    hasMsaAndRateCard: false,
    openQuestions: 3,
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
      add_msa_rate_card: { hasMsaAndRateCard: true },
      resolve_questions: { openQuestions: 0 },
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
      "add_msa_rate_card",
      "resolve_questions",
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
        hasMsaAndRateCard: false,
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
    expect(id({ openQuestions: 4 })).toBe("approve_sow");
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
    const withMsa = { ...fresh, hasMsaAndRateCard: true };
    expect(id({ ...withMsa, briefAssessment: "complete" })).toBe("confirm_scope");
    expect(id({ ...withMsa, briefAssessment: "thin" })).toBe("resolve_questions");
  });

  it("the MSA and rate card rule stops mattering once an estimate exists (it has been priced already)", () => {
    expect(id({ hasMsaAndRateCard: false, estimateApproved: false, hasEstimate: true })).toBe(
      "approve_estimate"
    );
  });

  it("the MSA and rate card rule comes before the open questions rule, and stops mattering once the estimate is approved", () => {
    expect(id({ ...fresh })).toBe("add_msa_rate_card");
    expect(id({ hasMsaAndRateCard: false, estimateApproved: true })).toBe("approve_sow");
  });

  it("open questions no longer wait on an email: they are the next step until answered or scope is confirmed", () => {
    expect(id({ openQuestions: 2, scopeConfirmed: false, estimateApproved: false })).toBe(
      "resolve_questions"
    );
    expect(id({ openQuestions: 0, scopeConfirmed: false, estimateApproved: false })).toBe(
      "confirm_scope"
    );
  });
});
