import { describe, expect, it } from "vitest";
import {
  PROJECT_STEPS,
  RETIRED_PHASE_SLUGS,
  buildStepSummaries,
  deriveStepStatuses,
  getCurrentStepId,
  getStep,
  isProjectComplete,
  isStepId,
  stepAccessibleName,
  type StepStatusInput,
} from "@/lib/projectSteps";

const base: StepStatusInput = {
  scopeConfirmedAt: null,
  hasApprovedEstimate: false,
  hasEstimateWork: false,
  hasApprovedSow: false,
  hasSowVersion: false,
};

describe("PROJECT_STEPS", () => {
  it("is Brief, Estimate, SOW in order, with slugs and headings", () => {
    expect(PROJECT_STEPS.map((s) => [s.order, s.label, s.slug, s.heading])).toEqual([
      [1, "Brief", "brief", "Brief"],
      [2, "Estimate", "estimate", "Estimate"],
      [3, "SOW", "sow", "Statement of Work"],
    ]);
  });

  it("recognises step slugs only", () => {
    expect(["brief", "estimate", "sow"].every(isStepId)).toBe(true);
    expect(RETIRED_PHASE_SLUGS.some(isStepId)).toBe(false);
    expect(isStepId("estimates")).toBe(false);
  });
});

describe("deriveStepStatuses — every combination", () => {
  const bools = [false, true];
  const cases: StepStatusInput[] = [];
  for (const scope of bools)
    for (const approvedEstimate of bools)
      for (const estimateWork of bools)
        for (const approvedSow of bools)
          for (const sowVersion of bools)
            cases.push({
              scopeConfirmedAt: scope ? new Date("2026-11-03T10:00:00Z") : null,
              hasApprovedEstimate: approvedEstimate,
              hasEstimateWork: estimateWork,
              hasApprovedSow: approvedSow,
              hasSowVersion: sowVersion,
            });

  it.each(cases)("%o", (input) => {
    const statuses = deriveStepStatuses(input);
    expect(statuses.brief).toBe(input.scopeConfirmedAt ? "done" : "in_progress");
    expect(statuses.estimate).toBe(
      input.hasApprovedEstimate ? "done" : input.hasEstimateWork ? "in_progress" : "not_started"
    );
    expect(statuses.sow).toBe(
      input.hasApprovedSow ? "done" : input.hasSowVersion ? "in_progress" : "not_started"
    );
  });

  it("covers all 32 combinations", () => {
    expect(cases).toHaveLength(32);
  });

  it("accepts the confirmation time as an ISO string (serialised to the client)", () => {
    expect(
      deriveStepStatuses({ ...base, scopeConfirmedAt: "2026-11-03T10:00:00.000Z" }).brief
    ).toBe("done");
  });

  it("is shared through each step's deriveStatus", () => {
    const input = { ...base, hasEstimateWork: true };
    const statuses = deriveStepStatuses(input);
    for (const step of PROJECT_STEPS) expect(step.deriveStatus(input)).toBe(statuses[step.id]);
  });
});

describe("getCurrentStepId / isProjectComplete", () => {
  it("is the first step not done", () => {
    expect(getCurrentStepId(deriveStepStatuses(base))).toBe("brief");
    expect(getCurrentStepId(deriveStepStatuses({ ...base, scopeConfirmedAt: new Date() }))).toBe(
      "estimate"
    );
    expect(
      getCurrentStepId(
        deriveStepStatuses({ ...base, scopeConfirmedAt: new Date(), hasApprovedEstimate: true })
      )
    ).toBe("sow");
  });

  it("skips past a done step even if an earlier one isn't done (no step is locked)", () => {
    // Estimate approved but scope never confirmed: Brief is still current.
    expect(getCurrentStepId(deriveStepStatuses({ ...base, hasApprovedEstimate: true }))).toBe(
      "brief"
    );
  });

  it("is sow once everything is done, and the project is complete only when the SOW is approved", () => {
    const all = deriveStepStatuses({
      scopeConfirmedAt: new Date(),
      hasApprovedEstimate: true,
      hasEstimateWork: true,
      hasApprovedSow: true,
      hasSowVersion: true,
    });
    expect(getCurrentStepId(all)).toBe("sow");
    expect(isProjectComplete(all)).toBe(true);
    expect(isProjectComplete(deriveStepStatuses({ ...base, hasApprovedEstimate: true }))).toBe(
      false
    );
  });

  it("is sow whenever the SOW is approved, even if an earlier step isn't marked done", () => {
    expect(getCurrentStepId(deriveStepStatuses({ ...base, hasApprovedSow: true }))).toBe("sow");
  });
});

describe("done summaries and accessible names", () => {
  const summaries = buildStepSummaries({
    scopeConfirmedAt: "2026-11-03T15:00:00.000Z",
    approvedEstimate: {
      clientApprovedOn: "2026-10-18",
      total: 45675,
      currency: "USD",
      downloadHref: "/api/est/v3",
      versionNumber: 3,
    },
    approvedSow: { clientApprovedOn: "2026-10-22", versionNumber: 2, downloadHref: "/api/sow/v2" },
  });

  it("matches the brief's one-liners", () => {
    expect(summaries.brief?.text).toBe("Scope confirmed · 3 Nov");
    expect(summaries.estimate?.text).toBe("Approved 18 Oct · 45,675.00 USD");
    expect(summaries.sow?.text).toBe("Approved 22 Oct · v2");
  });

  it("links the approved estimate and SOW files, not the brief", () => {
    expect(summaries.brief?.downloadHref).toBeUndefined();
    expect(summaries.estimate?.downloadHref).toBe("/api/est/v3");
    expect(summaries.sow?.downloadHref).toBe("/api/sow/v2");
  });

  it("speaks status and summary in the step's accessible name", () => {
    expect(stepAccessibleName(getStep("estimate"), "done", summaries.estimate)).toBe(
      "Estimate, done, approved 18 October, 45,675.00 US dollars"
    );
    expect(stepAccessibleName(getStep("sow"), "in_progress")).toBe("SOW, in progress");
    expect(stepAccessibleName(getStep("brief"), "done", summaries.brief)).toBe(
      "Brief, done, scope confirmed 3 November"
    );
  });

  it("has no summary for a step that isn't done", () => {
    expect(
      buildStepSummaries({ scopeConfirmedAt: null, approvedEstimate: null, approvedSow: null })
    ).toEqual({});
  });
});
