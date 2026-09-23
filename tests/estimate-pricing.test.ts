import { describe, expect, it } from "vitest";
import {
  buildEstimateDescription,
  computeEstimateTotals,
  computeLineItemFee,
} from "@/services/pricing/estimate-pricing";

// Unit conversion itself (hours/days/weeks, the Fizzy example) is covered
// in estimate-unit-conversion.test.ts.
const FACTORS = { hoursPerDay: 7.5, daysPerWeek: 5 };

describe("computeLineItemFee", () => {
  it("multiplies quantity by rate when the unit matches the rate basis", () => {
    expect(
      computeLineItemFee(
        { quantity: 3, unit: "DAYS", rate: 425.5, rateType: "DAILY" },
        FACTORS
      ).fee.toNumber()
    ).toBe(1276.5);
  });

  it("handles decimal quantities (e.g. half a day)", () => {
    expect(
      computeLineItemFee(
        { quantity: 0.5, unit: "DAYS", rate: 800, rateType: "DAILY" },
        FACTORS
      ).fee.toNumber()
    ).toBe(400);
  });

  it("avoids float drift on money-sensitive values", () => {
    // 0.1 + 0.2 famously != 0.3 in native floating point.
    const a = computeLineItemFee(
      { quantity: 3, unit: "HOURS", rate: 0.1, rateType: "HOURLY" },
      FACTORS
    ).fee;
    const b = computeLineItemFee(
      { quantity: 3, unit: "HOURS", rate: 0.2, rateType: "HOURLY" },
      FACTORS
    ).fee;
    expect(a.plus(b).toNumber()).toBe(0.9);
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
