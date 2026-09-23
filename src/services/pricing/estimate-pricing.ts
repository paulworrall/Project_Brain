import { Prisma } from "@/generated/prisma/client";
import type { Capability, EstimateUnit, RateType } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";
import { hoursPerUnit, toHours, type ConversionFactors } from "@/services/pricing/unit-conversion";

/** Anything Prisma.Decimal's constructor accepts — avoids importing decimal.js directly just for its Value type. */
type DecimalInput = number | string | Prisma.Decimal;

export interface LineItemPricingInput {
  quantity: DecimalInput;
  unit: EstimateUnit;
  rate: DecimalInput;
  rateType: RateType;
}

export interface LineItemPricing {
  hours: Prisma.Decimal;
  fee: Prisma.Decimal;
}

/**
 * Deterministic pricing — plain code, never LLM output. The quantity is
 * converted to hours first, then fee = hours x hourly-equivalent rate
 * (a daily/weekly rate is divided by its hours; multiplying before dividing
 * keeps e.g. 11.25 hrs x 500/7.5 exactly 750). Every value goes through
 * Prisma.Decimal (not native floats) to avoid drift on money; the fee is
 * rounded to 2dp.
 */
export function computeLineItemFee(
  line: LineItemPricingInput,
  factors: ConversionFactors
): LineItemPricing {
  const hours = toHours(line.quantity, line.unit, factors);
  const fee = hours
    .times(new Prisma.Decimal(line.rate))
    .dividedBy(hoursPerUnit(line.rateType, factors))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { hours, fee };
}

export function computeEstimateTotals(lines: { feeSubtotal: DecimalInput }[]): Prisma.Decimal {
  return lines.reduce(
    (sum, line) => sum.plus(new Prisma.Decimal(line.feeSubtotal)),
    new Prisma.Decimal(0)
  );
}

/** "Client Engagement & Delivery" -> "CEAD" (an "&" spells out as "And"). */
function capabilityCode(capability: Capability): string {
  return capabilityLabel(capability)
    .replace(/&/g, "And")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * The estimate's one-line summary (e.g. "3 capabilities: CEAD, ED, MO") —
 * plain code, never agent output, same rule as pricing above.
 */
export function buildEstimateDescription(capabilities: Capability[]): string {
  if (capabilities.length === 0) {
    return "No capabilities included yet.";
  }
  const codes = capabilities.map((c) => capabilityCode(c));
  const noun = capabilities.length === 1 ? "capability" : "capabilities";
  return `${capabilities.length} ${noun}: ${codes.join(", ")}`;
}
