import { describe, expect, it } from "vitest";
import { resolveMatchRouting } from "@/lib/estimateMatching";

const THRESHOLD = 0.8;

describe("resolveMatchRouting", () => {
  it("auto-resolves a ROLE_AND_LEVEL match at or above the confidence threshold", () => {
    expect(
      resolveMatchRouting(
        { matchType: "ROLE_AND_LEVEL", confidence: 0.8, suggestedRateCardLineId: "line_1" },
        THRESHOLD
      ).autoResolve
    ).toBe(true);

    expect(
      resolveMatchRouting(
        { matchType: "ROLE_AND_LEVEL", confidence: 0.95, suggestedRateCardLineId: "line_1" },
        THRESHOLD
      ).autoResolve
    ).toBe(true);
  });

  it("never auto-resolves a ROLE_ONLY match, even at maximum confidence — role-only is never sufficient alone", () => {
    expect(
      resolveMatchRouting(
        { matchType: "ROLE_ONLY", confidence: 1.0, suggestedRateCardLineId: "line_1" },
        THRESHOLD
      ).autoResolve
    ).toBe(false);
  });

  it("never auto-resolves a NO_MATCH judgment regardless of confidence", () => {
    expect(
      resolveMatchRouting(
        { matchType: "NO_MATCH", confidence: 1.0, suggestedRateCardLineId: null },
        THRESHOLD
      ).autoResolve
    ).toBe(false);
  });

  it("does not auto-resolve a ROLE_AND_LEVEL match below the confidence threshold", () => {
    expect(
      resolveMatchRouting(
        { matchType: "ROLE_AND_LEVEL", confidence: 0.79, suggestedRateCardLineId: "line_1" },
        THRESHOLD
      ).autoResolve
    ).toBe(false);
  });

  it("does not auto-resolve a ROLE_AND_LEVEL match with no suggested line, even at high confidence", () => {
    expect(
      resolveMatchRouting(
        { matchType: "ROLE_AND_LEVEL", confidence: 0.99, suggestedRateCardLineId: null },
        THRESHOLD
      ).autoResolve
    ).toBe(false);
  });
});
