import {
  getBriefAttribute,
  isSubFieldFilled,
  TIMELINE_FIELDS,
  type BriefAttributeValues,
  type BriefMilestone,
} from "@/lib/briefAttributes";
import type { BriefCompleteness } from "@/lib/briefCompleteness";

// How key-detail values read to people — shared by the UI and the
// generated documents so they always say the same thing. Prisma-free (types
// only from briefCompleteness), so client components can use it too.

export const NO_MILESTONES_TEXT = "No milestones confirmed yet";
export const NOT_CONFIRMED_TEXT = "Not captured yet";
export const MILESTONE_DATE_MISSING_TEXT = "Date not confirmed";

/** An ISO yyyy-mm-dd date as "1 Oct 2026"; anything unparseable as-is. */
export function formatBriefDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

export function formatMilestone(milestone: BriefMilestone): string {
  return `${milestone.name} — ${
    milestone.date ? formatBriefDate(milestone.date) : MILESTONE_DATE_MISSING_TEXT
  }`;
}

/**
 * An attribute's value as one short line for the compact checklist row —
 * filled sub-fields only, dates formatted, milestones counted. The full
 * values sit behind "Show more".
 */
export function summarizeValues(attributeId: string, values: BriefAttributeValues): string {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return "";
  return attribute.subFields
    .filter((f) => isSubFieldFilled(f, values[f.id]))
    .map((f) => {
      const value = values[f.id];
      if (Array.isArray(value)) return `${value.length} milestone${value.length === 1 ? "" : "s"}`;
      if (typeof value !== "string") return "";
      return f.type === "date" ? `${f.label}: ${formatBriefDate(value)}` : value;
    })
    .filter(Boolean)
    .join(" · ");
}

/** The timeline as a document section: the config's label plus the current values. */
export interface TimelineSection {
  heading: string;
  /** Sub-field labels, from the config. */
  labels: { startDate: string; endDate: string; milestones: string };
  startDate: string | null;
  endDate: string | null;
  milestones: BriefMilestone[];
}

function dateValue(values: BriefAttributeValues | undefined, id: string): string | null {
  const value = values?.[id];
  return typeof value === "string" && value ? value : null;
}

function milestonesValue(values: BriefAttributeValues | undefined): BriefMilestone[] {
  const value = values?.[TIMELINE_FIELDS.milestones];
  return Array.isArray(value) ? value : [];
}

/**
 * The timeline, from the key details only — so a document can never show a
 * date nobody gave us. Missing values are left null for the renderer to say
 * so plainly.
 */
export function timelineSection(completeness: BriefCompleteness): TimelineSection {
  const definition = getBriefAttribute(TIMELINE_FIELDS.attributeId);
  const label = (id: string) => definition?.subFields.find((f) => f.id === id)?.label ?? id;
  const attribute = completeness.attributes.find((a) => a.id === TIMELINE_FIELDS.attributeId);
  const current = attribute?.current?.values;
  return {
    heading: definition?.label ?? "",
    labels: {
      startDate: label(TIMELINE_FIELDS.startDate),
      endDate: label(TIMELINE_FIELDS.endDate),
      milestones: label(TIMELINE_FIELDS.milestones),
    },
    startDate: dateValue(current, TIMELINE_FIELDS.startDate),
    endDate: dateValue(current, TIMELINE_FIELDS.endDate),
    milestones: milestonesValue(current),
  };
}
