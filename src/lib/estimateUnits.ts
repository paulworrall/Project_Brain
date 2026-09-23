import type { EstimateUnit } from "@/generated/prisma/enums";
import type { EstimateDocumentContent } from "@/types/estimates";

// Pure, Prisma-free unit helpers — safe to import from client components.
// Pricing itself lives in src/services/pricing/unit-conversion.ts.

const UNIT_ALIASES: Record<EstimateUnit, string[]> = {
  HOURS: [
    "h",
    "hr",
    "hrs",
    "hour",
    "hours",
    "person-hour",
    "person-hours",
    "man-hour",
    "man-hours",
  ],
  DAYS: ["d", "day", "days", "pd", "pds", "person-day", "person-days", "man-day", "man-days"],
  WEEKS: [
    "w",
    "wk",
    "wks",
    "week",
    "weeks",
    "person-week",
    "person-weeks",
    "man-week",
    "man-weeks",
  ],
};

/**
 * Maps a unit as written ("days", "Hrs", "person-days", or the enum value
 * itself) to an EstimateUnit. Returns null for anything missing or not
 * clearly one of the three (e.g. "months", "FTE", "unspecified") — the
 * caller flags that line for PM review; it is never defaulted to hours.
 * The migration that introduced EstimateUnit mirrors this alias list.
 */
export function parseEstimateUnit(raw: string | null | undefined): EstimateUnit | null {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const [unit, aliases] of Object.entries(UNIT_ALIASES) as [EstimateUnit, string[]][]) {
    if (aliases.includes(normalized)) {
      return unit;
    }
  }
  return null;
}

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

const UNIT_LABELS: Record<EstimateUnit, [singular: string, plural: string]> = {
  HOURS: ["hr", "hrs"],
  DAYS: ["day", "days"],
  WEEKS: ["week", "weeks"],
};

function unitLabel(quantity: number, unit: EstimateUnit): string {
  const [singular, plural] = UNIT_LABELS[unit];
  return quantity === 1 ? singular : plural;
}

/**
 * "1.5 days (11.25 hrs)", "40 hrs". `unit` is a string because saved
 * content from before unit conversion holds free text (e.g. "days",
 * "unspecified"); with no converted hours it just shows the stored text.
 */
export function formatQuantityWithHours(
  quantity: number,
  unit: string,
  hours: number | null | undefined
): string {
  const parsed = parseEstimateUnit(unit);
  if (parsed == null || hours == null) {
    return `${numberFormat.format(quantity)} ${unit}`;
  }
  const original = `${numberFormat.format(quantity)} ${unitLabel(quantity, parsed)}`;
  if (parsed === "HOURS") {
    return original;
  }
  return `${original} (${numberFormat.format(hours)} ${unitLabel(hours, "HOURS")})`;
}

export const ESTIMATE_UNIT_OPTIONS: { value: EstimateUnit; label: string }[] = [
  { value: "HOURS", label: "hours" },
  { value: "DAYS", label: "days" },
  { value: "WEEKS", label: "weeks" },
];

/** "Fees are calculated as hours x hourly rate, at 7.5 hrs/day and 5 days/week." — null on legacy content. */
export function conversionBasisNote(content: EstimateDocumentContent): string | null {
  if (content.hoursPerDay == null) {
    return null;
  }
  return `Fees are calculated as hours × hourly rate, at ${content.hoursPerDay} hrs/day and ${content.daysPerWeek} days/week.`;
}
