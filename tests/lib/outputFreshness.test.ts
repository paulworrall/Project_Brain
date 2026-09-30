import { describe, expect, it } from "vitest";
import { evaluateFreshness, staleHeadline } from "@/lib/outputFreshness";

const builtAt = new Date("2026-09-10T12:00:00Z");
const before = new Date("2026-09-09T12:00:00Z");
const after = new Date("2026-09-11T12:00:00Z");
const none = { updates: [], pmEdits: [], keyDetailChanges: [] };

describe("evaluateFreshness", () => {
  it("is fresh when nothing happened after the output was built", () => {
    const result = evaluateFreshness(
      { builtFromVersion: 2, builtAt },
      {
        updates: [{ versionNumber: 2, uploadedAt: before }],
        pmEdits: [before],
        keyDetailChanges: [{ createdAt: before, fromVersion: null }],
      }
    );
    expect(result).toEqual({ builtFromVersion: 2, latestVersion: 2, stale: false, reasons: [] });
  });

  it("is stale after a new update, naming the versions", () => {
    const result = evaluateFreshness(
      { builtFromVersion: 2, builtAt },
      {
        ...none,
        updates: [
          { versionNumber: 2, uploadedAt: before },
          { versionNumber: 3, uploadedAt: after },
          { versionNumber: 4, uploadedAt: after },
        ],
      }
    );
    expect(result.stale).toBe(true);
    expect(result.latestVersion).toBe(4);
    expect(result.reasons).toEqual(["New updates: v3, v4"]);
    expect(staleHeadline(result)).toBe("Built from v2 — v4 is available");
  });

  it("is stale after a PM perspective edit", () => {
    const result = evaluateFreshness({ builtFromVersion: 1, builtAt }, { ...none, pmEdits: [after] });
    expect(result.stale).toBe(true);
    expect(result.reasons).toEqual(["PM perspective edited"]);
    expect(staleHeadline(result)).toBe("Built from v1 — the PM perspective has changed since");
  });

  it("is stale after a key detail changes — a PM edit, or a value from a later update", () => {
    const pmEdit = evaluateFreshness(
      { builtFromVersion: 2, builtAt },
      { ...none, keyDetailChanges: [{ createdAt: after, fromVersion: null }] }
    );
    expect(pmEdit.reasons).toEqual(["Key details changed"]);
  });

  it("isn't made stale by key details read from the very version it was built from", () => {
    // An update refreshes the Position Document, then its key details are saved a moment later.
    const result = evaluateFreshness(
      { builtFromVersion: 3, builtAt },
      {
        ...none,
        updates: [{ versionNumber: 3, uploadedAt: before }],
        keyDetailChanges: [
          { createdAt: after, fromVersion: 3 },
          { createdAt: after, fromVersion: 1 },
        ],
      }
    );
    expect(result.stale).toBe(false);
  });

  it("works out the version an older output was built from by when it was built", () => {
    const result = evaluateFreshness(
      { builtFromVersion: null, builtAt },
      {
        ...none,
        updates: [
          { versionNumber: 2, uploadedAt: before },
          { versionNumber: 3, uploadedAt: after },
        ],
      }
    );
    expect(result.builtFromVersion).toBe(2);
    expect(result.reasons).toEqual(["New update: v3"]);
  });
});
