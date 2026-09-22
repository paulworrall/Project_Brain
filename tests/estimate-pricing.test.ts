import { describe, expect, it } from "vitest";
import {
  buildEstimateDescription,
  computeEstimateTotals,
  computeLineItemFee,
} from "@/services/pricing/estimate-pricing";

describe("computeLineItemFee", () => {
  it("multiplies quantity by rate", () => {
    expect(computeLineItemFee(3, 425.5).toNumber()).toBe(1276.5);
  });

  it("handles decimal quantities (e.g. half a day)", () => {
    expect(computeLineItemFee(0.5, 800).toNumber()).toBe(400);
  });

  it("avoids float drift on money-sensitive values", () => {
    // 0.1 + 0.2 famously != 0.3 in native floating point.
    expect(computeLineItemFee(3, 0.1).plus(computeLineItemFee(3, 0.2)).toNumber()).toBe(0.9);
  });
});

describe("computeEstimateTotals", () => {
  it("sums fee subtotals across multiple lines", () => {
    const total = computeEstimateTotals([
      { feeSubtotal: 1276.5 },
      { feeSubtotal: 400 },
      { feeSubtotal: 3200 },
    ]);
    expect(total.toNumber()).toBe(4876.5);
  });

  it("returns zero for an empty line list", () => {
    expect(computeEstimateTotals([]).toNumber()).toBe(0);
  });
});

describe("buildEstimateDescription", () => {
  it("builds a one-line summary with capability codes", () => {
    expect(
      buildEstimateDescription([
        "CLIENT_ENGAGEMENT_AND_DELIVERY",
        "EXPERIENCE_DESIGN",
        "MARKETING_OPERATIONS",
      ])
    ).toBe("3 capabilities: CEAD, ED, MO");
  });

  it("pluralizes correctly for a single capability", () => {
    expect(buildEstimateDescription(["TECH_AND_DATA"])).toBe("1 capability: TAD");
  });

  it("has a plain fallback for no capabilities", () => {
    expect(buildEstimateDescription([])).toBe("No capabilities included yet.");
  });
});
