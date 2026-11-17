import { describe, expect, it } from "vitest";
import { deriveSubTasks, SUB_TASK_FOR_ACTION } from "@/lib/project/subTasks";
import { deriveNextAction, type NextActionInput } from "@/lib/nextAction";
import { subTaskInput, subTasksFor } from "../fixtures/subTasks";

const ids = (step: "brief" | "estimate" | "sow") => subTasksFor(step).map((t) => t.id);
const byId = (tasks: ReturnType<typeof subTasksFor>, id: string) => tasks.find((t) => t.id === id)!;

describe("deriveSubTasks — the list for each step", () => {
  it("Brief: Key details, Scope summary, Confirm scope", () => {
    expect(ids("brief")).toEqual(["brief.key-details", "brief.scope-summary", "brief.confirm-scope"]);
    expect(subTasksFor("brief").map((t) => t.number)).toEqual([1, 2, 3]);
  });
  it("Estimate: Choose teams, Estimate brief, Specialist inputs, Build the estimate, Client approval", () => {
    expect(ids("estimate")).toEqual([
      "estimate.teams",
      "estimate.brief",
      "estimate.specialists",
      "estimate.build",
      "estimate.approval",
    ]);
  });
  it("SOW: Choose template, Generate SOW, Client approval", () => {
    expect(ids("sow")).toEqual(["sow.template", "sow.generate", "sow.approval"]);
  });
});

describe("deriveSubTasks — Brief states", () => {
  it("a new project: key details come first, then the scope summary", () => {
    const tasks = subTasksFor("brief", {
      hasScopeSummary: false,
      scopeVersion: null,
      scopeConfirmed: false,
      requiredCaptured: 0,
      openQuestions: 0,
    });
    expect(tasks.map((t) => t.status)).toEqual(["not_started", "not_started", "not_started"]);
    expect(tasks.find((t) => t.current)?.id).toBe("brief.key-details");
    // With the key details done, the scope summary is next.
    const afterDetails = subTasksFor("brief", {
      hasScopeSummary: false,
      scopeVersion: null,
      scopeConfirmed: false,
      requiredCaptured: 4,
    });
    expect(afterDetails.find((t) => t.current)?.id).toBe("brief.scope-summary");
  });

  it("key details: '3 of 4 captured' is in progress; all captured is done", () => {
    const partial = subTasksFor("brief", { scopeConfirmed: false, requiredCaptured: 3 });
    expect(byId(partial, "brief.key-details")).toMatchObject({
      status: "in_progress",
      summary: "3 of 4 captured",
      current: true,
    });
    const all = subTasksFor("brief", { scopeConfirmed: false, requiredCaptured: 4 });
    expect(byId(all, "brief.key-details")).toMatchObject({ status: "done", summary: "4 of 4 captured" });
    expect(all.find((t) => t.current)?.id).toBe("brief.confirm-scope");
  });

  it("the scope summary line carries its version and open questions", () => {
    const tasks = subTasksFor("brief", { openQuestions: 2, scopeConfirmed: false });
    expect(byId(tasks, "brief.scope-summary").summary).toBe("v2 · 2 open questions");
    expect(byId(subTasksFor("brief", { openQuestions: 1 }), "brief.scope-summary").summary).toBe(
      "v2 · 1 open question"
    );
  });

  it("confirmed scope is done with the stepper's summary; a newer summary needs review and is current", () => {
    expect(byId(subTasksFor("brief"), "brief.confirm-scope")).toMatchObject({
      status: "done",
      summary: "Scope confirmed · 3 Nov",
    });
    const newer = subTasksFor("brief", { scopeNewerThanConfirmed: true, estimateApproved: false });
    expect(byId(newer, "brief.confirm-scope")).toMatchObject({ status: "needs_review", current: true });
  });
});

describe("deriveSubTasks — Estimate states, blocked and soft", () => {
  const fresh = {
    capabilityCount: 0,
    hasEstimateBrief: false,
    specialistReceived: 0,
    specialistTotal: 0,
    hasEstimate: false,
    estimateStale: false,
    estimateApproved: false,
  };

  it("with no teams: teams is current; brief and specialist inputs are blocked with a reason", () => {
    const tasks = subTasksFor("estimate", fresh);
    expect(byId(tasks, "estimate.teams")).toMatchObject({ status: "not_started", current: true, blocked: null });
    expect(byId(tasks, "estimate.brief").blocked).toBe("Choose teams first");
    expect(byId(tasks, "estimate.specialists").blocked).toBe("Choose teams first");
    expect(byId(tasks, "estimate.approval").blocked).toBe("Needs an estimate");
    // Build the estimate is a soft prerequisite elsewhere: never blocked here.
    expect(byId(tasks, "estimate.build").blocked).toBeNull();
  });

  it("teams chosen: the brief is next; specialist inputs read '0 of 2 received'", () => {
    const tasks = subTasksFor("estimate", { ...fresh, capabilityCount: 2, specialistTotal: 2 });
    expect(tasks.find((t) => t.current)?.id).toBe("estimate.brief");
    expect(byId(tasks, "estimate.specialists")).toMatchObject({ summary: "0 of 2 received", blocked: null });
  });

  it("waiting on specialists: in progress while some are in, and current once the brief is done", () => {
    const tasks = subTasksFor("estimate", {
      ...fresh,
      capabilityCount: 3,
      hasEstimateBrief: true,
      specialistReceived: 1,
      specialistTotal: 3,
    });
    expect(byId(tasks, "estimate.specialists")).toMatchObject({
      status: "in_progress",
      summary: "1 of 3 received",
      current: true,
    });
  });

  it("once an estimate exists, outstanding specialist inputs are not the current task", () => {
    const tasks = subTasksFor("estimate", {
      ...fresh,
      capabilityCount: 3,
      hasEstimateBrief: true,
      specialistReceived: 0,
      specialistTotal: 3,
      hasEstimate: true,
    });
    expect(tasks.find((t) => t.current)?.id).toBe("estimate.approval");
  });

  it("a stale unapproved estimate needs review and is current; once approved it is done", () => {
    const stale = subTasksFor("estimate", { estimateStale: true, estimateApproved: false });
    expect(byId(stale, "estimate.build")).toMatchObject({ status: "needs_review", current: true });
    expect(byId(subTasksFor("estimate"), "estimate.build").status).toBe("done");
    expect(byId(subTasksFor("estimate"), "estimate.approval")).toMatchObject({
      status: "done",
      summary: "Approved 18 Oct · 45,675.00 USD",
    });
  });
});

describe("deriveSubTasks — SOW states", () => {
  it("no SOW yet: generate is current and approval is blocked", () => {
    const tasks = subTasksFor("sow", { hasSow: false });
    expect(tasks.find((t) => t.current)?.id).toBe("sow.generate");
    expect(byId(tasks, "sow.approval").blocked).toBe("Needs a SOW");
  });
  it("no template chosen: choosing one comes first", () => {
    expect(subTasksFor("sow", { hasSowTemplate: false, hasSow: false }).find((t) => t.current)?.id).toBe(
      "sow.template"
    );
  });
  it("an out-of-date SOW needs review and is current; an up-to-date one waits for approval", () => {
    expect(byId(subTasksFor("sow", { sowStale: true }), "sow.generate")).toMatchObject({
      status: "needs_review",
      current: true,
    });
    expect(subTasksFor("sow").find((t) => t.current)?.id).toBe("sow.approval");
  });
});

describe("deriveSubTasks — complete project", () => {
  const complete = { projectComplete: true, sowApproved: true };

  it("nothing is current, nothing is blocked, anything not done reads Locked", () => {
    for (const step of ["brief", "estimate", "sow"] as const) {
      const tasks = subTasksFor(step, complete);
      expect(tasks.some((t) => t.current)).toBe(false);
      expect(tasks.every((t) => t.blocked === null)).toBe(true);
    }
    const brief = subTasksFor("brief", { ...complete, hasScopeSummary: false, scopeConfirmed: false });
    expect(byId(brief, "brief.scope-summary").status).toBe("locked");
    expect(byId(subTasksFor("sow", complete), "sow.approval")).toMatchObject({
      status: "done",
      summary: "Approved 22 Oct · v2",
    });
  });
});

describe("the current sub-task agrees with the Next step banner where they overlap", () => {
  /** The same project as the next-action tests: everything done but the SOW approval. */
  const base: NextActionInput = {
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

  function currentIdFor(input: NextActionInput, step: "brief" | "estimate" | "sow"): string | undefined {
    const tasks = deriveSubTasks(
      {
        ...input,
        scopeVersion: 1,
        requiredCaptured: 4,
        requiredTotal: 4,
        hasSowTemplate: true,
        scopeConfirmedLabel: null,
        estimateApprovedLabel: null,
        sowApprovedLabel: null,
      },
      step
    );
    return tasks.find((t) => t.current)?.id;
  }

  const cases: [string, Partial<NextActionInput>][] = [
    ["confirm_scope", { scopeConfirmed: false, estimateApproved: false, hasEstimate: false }],
    ["confirm_latest_scope", { scopeNewerThanConfirmed: true, estimateApproved: false }],
    [
      "choose_capabilities",
      {
        capabilityCount: 0,
        specialistTotal: 0,
        specialistReceived: 0,
        hasEstimateBrief: false,
        hasEstimate: false,
        estimateApproved: false,
      },
    ],
    [
      "prepare_estimate_brief",
      { hasEstimateBrief: false, hasEstimate: false, estimateApproved: false, specialistReceived: 0 },
    ],
    ["wait_specialists", { specialistReceived: 1, specialistTotal: 3, hasEstimate: false, estimateApproved: false }],
    ["build_estimate", { hasEstimate: false, estimateApproved: false }],
    ["review_estimate", { estimateStale: true, estimateApproved: false }],
    ["approve_estimate", { estimateApproved: false }],
    ["generate_sow", { hasSow: false }],
    ["generate_sow", { sowStale: true }],
    ["approve_sow", {}],
  ];

  it.each(cases)("%s", (actionId, overrides) => {
    const input = { ...base, ...overrides };
    const action = deriveNextAction(input);
    expect(action.id).toBe(actionId);
    const expected = SUB_TASK_FOR_ACTION[action.id];
    expect(expected).toBeDefined();
    expect(currentIdFor(input, action.step)).toBe(expected);
  });

  it("the sub-task input is the next-action input plus a few display facts", () => {
    expect(Object.keys(subTaskInput)).toEqual(
      expect.arrayContaining(["hasScopeSummary", "estimateApproved", "scopeVersion", "requiredCaptured"])
    );
  });
});
