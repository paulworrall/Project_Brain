import { describe, expect, it } from "vitest";
import {
  PROJECT_PHASES,
  deriveProjectPhaseStatuses,
  getCurrentPhaseId,
  isPhaseId,
} from "@/lib/projectPhases";

describe("deriveProjectPhaseStatuses", () => {
  it("Discover is in progress without a client-approved SOW", () => {
    const statuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: false });
    expect(statuses.discover).toBe("in_progress");
  });

  it("Discover is complete once the SOW is client-approved", () => {
    const statuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: true });
    expect(statuses.discover).toBe("complete");
  });

  it.each([true, false])("later phases are always not started (approved SOW: %s)", (approved) => {
    const statuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: approved });
    expect(statuses.define).toBe("not_started");
    expect(statuses.develop).toBe("not_started");
    expect(statuses.deliver).toBe("not_started");
    expect(statuses.dialogue).toBe("not_started");
  });
});

describe("getCurrentPhaseId", () => {
  it("is Discover until its SOW is approved, then Define", () => {
    expect(getCurrentPhaseId(deriveProjectPhaseStatuses({ hasClientApprovedSow: false }))).toBe("discover");
    expect(getCurrentPhaseId(deriveProjectPhaseStatuses({ hasClientApprovedSow: true }))).toBe("define");
  });
});

describe("PROJECT_PHASES config", () => {
  it("lists the five phases in order with tokens, not hex", () => {
    expect(PROJECT_PHASES.map((p) => p.id)).toEqual(["discover", "define", "develop", "deliver", "dialogue"]);
    expect(PROJECT_PHASES.map((p) => p.order)).toEqual([1, 2, 3, 4, 5]);
    for (const phase of PROJECT_PHASES) {
      expect(phase.accentToken).not.toMatch(/^#/);
      expect(phase.verbs).toHaveLength(2);
      expect(phase.activities.length).toBeGreaterThan(0);
    }
    expect(PROJECT_PHASES.filter((p) => p.available).map((p) => p.id)).toEqual(["discover"]);
  });

  it("validates slugs", () => {
    expect(isPhaseId("define")).toBe(true);
    expect(isPhaseId("nonsense")).toBe(false);
  });
});
