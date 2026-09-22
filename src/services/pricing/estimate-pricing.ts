import { Prisma } from "@/generated/prisma/client";
import type { Capability } from "@/generated/prisma/enums";
import { capabilityLabel } from "@/lib/mapCapabilities";

/** Anything Prisma.Decimal's constructor accepts — avoids importing decimal.js directly just for its Value type. */
type DecimalInput = number | string | Prisma.Decimal;

/**
 * Deterministic pricing — plain code, never LLM output. quantity * rate,
 * summed to a total. Every value is normalized through Prisma.Decimal (not
 * native +/* after a float conversion) to avoid float drift on money.
 */
export function computeLineItemFee(quantity: DecimalInput, rate: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(quantity).times(new Prisma.Decimal(rate));
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
