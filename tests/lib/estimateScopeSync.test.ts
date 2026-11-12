import { describe, expect, it } from "vitest";
import {
  estimateScopeChangeSummary,
  evaluateEstimateScopeSync,
  type ScopeVersionRef,
} from "@/lib/estimateScopeSyncView";

const v = (n: number): ScopeVersionRef => ({
  id: `sv${n}`,
  versionNumber: n,
  createdAt: new Date(`2026-11-0${n}T10:00:00Z`),
});

describe("evaluateEstimateScopeSync", () => {
  it("is in sync while the estimate was built against the confirmed version", () => {
    expect(
      evaluateEstimateScopeSync({
        estimateId: "e1",
        source: v(2),
        confirmed: v(2),
        changedSections: [],
        approved: false,
      }).status
    ).toBe("in_sync");
  });

  it("is stale once a newer version is confirmed, naming the changed sections", () => {
    const sync = evaluateEstimateScopeSync({
      estimateId: "e1",
      source: v(1),
      confirmed: v(3),
      changedSections: ["Deliverables", "Assumptions"],
      approved: false,
    });
    expect(sync).toMatchObject({
      status: "stale",
      sourceVersionNumber: 1,
      confirmedVersionNumber: 3,
      changedSections: ["Deliverables", "Assumptions"],
    });
    expect(estimateScopeChangeSummary(sync)).toBe(
      "Changed: Deliverables, Assumptions — this estimate used v1"
    );
  });

  it("is unlinked (never flagged) for legacy estimates or when nothing is confirmed", () => {
    expect(
      evaluateEstimateScopeSync({
        estimateId: "e1",
        source: null,
        confirmed: v(2),
        changedSections: [],
        approved: false,
      }).status
    ).toBe("unlinked");
    expect(
      evaluateEstimateScopeSync({
        estimateId: "e1",
        source: v(1),
        confirmed: null,
        changedSections: [],
        approved: false,
      }).status
    ).toBe("unlinked");
  });

  it("is not stale when the confirmed version is older than the source (scope reopened and re-confirmed)", () => {
    expect(
      evaluateEstimateScopeSync({
        estimateId: "e1",
        source: v(3),
        confirmed: v(2),
        changedSections: [],
        approved: false,
      }).status
    ).toBe("in_sync");
  });

  it("carries whether the estimate is approved (information only)", () => {
    expect(
      evaluateEstimateScopeSync({
        estimateId: "e1",
        source: v(1),
        confirmed: v(2),
        changedSections: [],
        approved: true,
      })
    ).toMatchObject({ status: "stale", approved: true });
  });
});
