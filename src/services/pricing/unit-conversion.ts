import { Prisma } from "@/generated/prisma/client";
import type { EstimateUnit, RateType } from "@/generated/prisma/enums";
import { DAYS_PER_WEEK, HOURS_PER_DAY } from "@/lib/estimateUnitsConfig";

/** Anything Prisma.Decimal's constructor accepts. */
type DecimalInput = number | string | Prisma.Decimal;

export interface ConversionFactors {
  hoursPerDay: number;
  daysPerWeek: number;
}

/** What getConversionFactors needs to find a project's value — enough to reach its client's MSA later. */
export interface ConversionFactorsScope {
  id: string;
  clientId: string;
}

/**
 * The single place every estimate calculation gets its conversion factors
 * from. Returns the global default for now; later this will look up a
 * per-client value from the client's master service agreement (hence the
 * project scope argument and async signature, so callers don't change).
 * Whatever this returns is stored on each saved EstimateVersion.
 */
export async function getConversionFactors(
  _project: ConversionFactorsScope
): Promise<ConversionFactors> {
  return { hoursPerDay: HOURS_PER_DAY, daysPerWeek: DAYS_PER_WEEK };
}

/** How many hours one of `unit` (a quantity unit or a rate card's rate basis) is worth. */
export function hoursPerUnit(
  unit: EstimateUnit | RateType,
  factors: ConversionFactors
): Prisma.Decimal {
  switch (unit) {
    case "HOURS":
    case "HOURLY":
      return new Prisma.Decimal(1);
    case "DAYS":
    case "DAILY":
      return new Prisma.Decimal(factors.hoursPerDay);
    case "WEEKS":
    case "WEEKLY":
      return new Prisma.Decimal(factors.hoursPerDay).times(factors.daysPerWeek);
  }
}

export function toHours(
  quantity: DecimalInput,
  unit: EstimateUnit,
  factors: ConversionFactors
): Prisma.Decimal {
  return new Prisma.Decimal(quantity).times(hoursPerUnit(unit, factors));
}

export {
  ESTIMATE_UNIT_OPTIONS,
  formatQuantityWithHours,
  parseEstimateUnit,
} from "@/lib/estimateUnits";
