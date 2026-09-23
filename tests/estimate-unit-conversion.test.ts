import { describe, expect, it } from "vitest";
import { DAYS_PER_WEEK, HOURS_PER_DAY } from "@/lib/estimateUnitsConfig";
import {
  formatQuantityWithHours,
  getConversionFactors,
  parseEstimateUnit,
  toHours,
  type ConversionFactors,
} from "@/services/pricing/unit-conversion";
import { computeEstimateTotals, computeLineItemFee } from "@/services/pricing/estimate-pricing";

const DEFAULT_FACTORS: ConversionFactors = { hoursPerDay: 7.5, daysPerWeek: 5 };

describe("global conversion defaults", () => {
  it("defaults to 7.5 hours per day and 5 days per week", () => {
    expect(HOURS_PER_DAY).toBe(7.5);
    expect(DAYS_PER_WEEK).toBe(5);
  });

  it("getConversionFactors resolves the global default for any project (no per-client value yet)", async () => {
    await expect(getConversionFactors({ id: "project_1", clientId: "client_1" })).resolves.toEqual({
      hoursPerDay: HOURS_PER_DAY,
      daysPerWeek: DAYS_PER_WEEK,
    });
  });
});

describe("toHours", () => {
  it("leaves hours unchanged", () => {
    expect(toHours(40, "HOURS", DEFAULT_FACTORS).toNumber()).toBe(40);
  });

  it("converts days at hours-per-day", () => {
    expect(toHours(1.5, "DAYS", DEFAULT_FACTORS).toNumber()).toBe(11.25);
    expect(toHours(8, "DAYS", DEFAULT_FACTORS).toNumber()).toBe(60);
  });

  it("converts weeks at days-per-week x hours-per-day", () => {
    expect(toHours(1, "WEEKS", DEFAULT_FACTORS).toNumber()).toBe(37.5);
    expect(toHours(2.5, "WEEKS", DEFAULT_FACTORS).toNumber()).toBe(93.75);
  });

  it("uses whatever factors it is given, not a hard-coded 7.5", () => {
    expect(toHours(2, "DAYS", { hoursPerDay: 8, daysPerWeek: 5 }).toNumber()).toBe(16);
    expect(toHours(1, "WEEKS", { hoursPerDay: 8, daysPerWeek: 4 }).toNumber()).toBe(32);
  });
});

describe("parseEstimateUnit", () => {
  it.each([
    ["hours", "HOURS"],
    ["Hrs", "HOURS"],
    ["h", "HOURS"],
    ["days", "DAYS"],
    ["Day", "DAYS"],
    ["person-days", "DAYS"],
    ["weeks", "WEEKS"],
    ["wks", "WEEKS"],
    ["DAYS", "DAYS"],
  ] as const)("reads %s as %s", (raw, expected) => {
    expect(parseEstimateUnit(raw)).toBe(expected);
  });

  it.each([null, undefined, "", "unspecified", "months", "FTE", "sprints"])(
    "flags %s as unknown (null) rather than defaulting to hours",
    (raw) => {
      expect(parseEstimateUnit(raw)).toBeNull();
    }
  );
});

describe("computeLineItemFee", () => {
  it("reproduces the Review screen example: 1.5 days @ 220.00/hourly = 2,475.00", () => {
    const { hours, fee } = computeLineItemFee(
      { quantity: 1.5, unit: "DAYS", rate: 220, rateType: "HOURLY" },
      DEFAULT_FACTORS
    );
    expect(hours.toNumber()).toBe(11.25);
    expect(fee.toFixed(2)).toBe("2475.00");
  });

  it("prices hours at an hourly rate directly", () => {
    const { fee } = computeLineItemFee(
      { quantity: 50, unit: "HOURS", rate: 265, rateType: "HOURLY" },
      DEFAULT_FACTORS
    );
    expect(fee.toNumber()).toBe(13250);
  });

  it("prices weeks at an hourly rate via hours", () => {
    const { hours, fee } = computeLineItemFee(
      { quantity: 2, unit: "WEEKS", rate: 100, rateType: "HOURLY" },
      DEFAULT_FACTORS
    );
    expect(hours.toNumber()).toBe(75);
    expect(fee.toNumber()).toBe(7500);
  });

  it("handles a daily-rate card: days @ daily rate is unchanged, hours @ daily rate is pro-rated", () => {
    expect(
      computeLineItemFee(
        { quantity: 5, unit: "DAYS", rate: 700, rateType: "DAILY" },
        DEFAULT_FACTORS
      ).fee.toNumber()
    ).toBe(3500);
    // 15 hours = 2 days at 7.5 hrs/day.
    expect(
      computeLineItemFee(
        { quantity: 15, unit: "HOURS", rate: 700, rateType: "DAILY" },
        DEFAULT_FACTORS
      ).fee.toNumber()
    ).toBe(1400);
  });

  it("handles a weekly-rate card", () => {
    expect(
      computeLineItemFee(
        { quantity: 3, unit: "DAYS", rate: 2500, rateType: "WEEKLY" },
        DEFAULT_FACTORS
      ).fee.toNumber()
    ).toBe(1500);
  });

  it("does not drift on a rate that doesn't divide evenly into hours", () => {
    // 1.5 days @ 500/day: 11.25 hrs x (500 / 7.5) must still be exactly 750.
    expect(
      computeLineItemFee(
        { quantity: 1.5, unit: "DAYS", rate: 500, rateType: "DAILY" },
        DEFAULT_FACTORS
      ).fee.toFixed(2)
    ).toBe("750.00");
  });

  it("rounds the fee to 2 decimal places", () => {
    // 0.33 days @ 333.33/day = 109.9989 -> 110.00
    expect(
      computeLineItemFee(
        { quantity: 0.33, unit: "DAYS", rate: 333.33, rateType: "DAILY" },
        DEFAULT_FACTORS
      ).fee.toFixed(2)
    ).toBe("110.00");
  });
});

describe("Fizzy Europe Rate Card v1 — 'First draft' 6-line estimate", () => {
  // The exact lines from the saved v1 that showed 6,570.00 USD (rate x days).
  const lines = [
    { role: "Account Director", quantity: 1.5, rate: 220 },
    { role: "Project Manager", quantity: 8, rate: 150 },
    { role: "Technical Lead", quantity: 6, rate: 240 },
    { role: "Developer", quantity: 12, rate: 200 },
    { role: "Data Analyst", quantity: 4, rate: 150 },
    { role: "Developer", quantity: 3, rate: 200 },
  ].map((line) => ({ ...line, unit: "DAYS" as const, rateType: "HOURLY" as const }));

  it("totals 49,275.00 at 7.5 hrs/day (not the old 6,570.00)", () => {
    const priced = lines.map((line) => ({
      feeSubtotal: computeLineItemFee(line, DEFAULT_FACTORS).fee,
    }));
    const expectedFees = [2475, 9000, 10800, 18000, 4500, 4500];
    expect(priced.map((p) => p.feeSubtotal.toNumber())).toEqual(expectedFees);
    expect(computeEstimateTotals(priced).toFixed(2)).toBe("49275.00");
  });
});

describe("formatQuantityWithHours", () => {
  it("shows the original quantity and unit plus converted hours", () => {
    expect(formatQuantityWithHours(1.5, "DAYS", 11.25)).toBe("1.5 days (11.25 hrs)");
    expect(formatQuantityWithHours(1, "WEEKS", 37.5)).toBe("1 week (37.5 hrs)");
  });

  it("doesn't repeat hours for a line already in hours", () => {
    expect(formatQuantityWithHours(40, "HOURS", 40)).toBe("40 hrs");
    expect(formatQuantityWithHours(1, "HOURS", 1)).toBe("1 hr");
  });

  it("falls back to the stored unit text when there are no converted hours (legacy versions)", () => {
    expect(formatQuantityWithHours(1.5, "days", null)).toBe("1.5 days");
    expect(formatQuantityWithHours(1000, "unspecified", undefined)).toBe("1,000 unspecified");
  });
});
