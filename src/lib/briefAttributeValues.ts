import * as z from "zod";
import type {
  BriefAttributeDefinition,
  BriefAttributeValues,
  BriefMilestone,
  BriefSubFieldDefinition,
} from "@/lib/briefAttributes";

// Reading, validating and comparing attribute values — all driven by the
// sub-field definitions in src/lib/briefAttributes.ts, never by hard-coded
// ids. Prisma-free so client components can use it too.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMilestones(value: unknown): BriefMilestone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const name = normalizeText((item as Record<string, unknown>).name);
    if (!name) return [];
    const date = normalizeText((item as Record<string, unknown>).date);
    return [{ name, date: date && ISO_DATE.test(date) ? date : null }];
  });
}

function normalizeSubField(subField: BriefSubFieldDefinition, value: unknown) {
  if (subField.type === "milestones") return normalizeMilestones(value);
  const text = normalizeText(value);
  if (subField.type === "currency") return text ? text.toUpperCase() : null;
  return text;
}

/**
 * Coerces any stored or submitted JSON into a clean values object for this
 * attribute: only its configured sub-fields, trimmed, blanks as null (an
 * empty list for milestones). Unknown keys are dropped.
 */
export function normalizeAttributeValues(
  attribute: BriefAttributeDefinition,
  raw: unknown
): BriefAttributeValues {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    attribute.subFields.map((subField) => [
      subField.id,
      normalizeSubField(subField, source[subField.id]),
    ])
  );
}

function formatError(subField: BriefSubFieldDefinition): string | null {
  switch (subField.type) {
    case "email":
      return `${subField.label}: enter a valid email address.`;
    case "date":
      return `${subField.label}: enter a valid date.`;
    case "currency":
      return `${subField.label}: use a 3-letter currency code, e.g. GBP.`;
    default:
      return null;
  }
}

const FORMAT_CHECKS: Partial<Record<BriefSubFieldDefinition["type"], z.ZodType<string>>> = {
  email: z.email(),
  date: z
    .string()
    .regex(ISO_DATE)
    .refine((d) => !Number.isNaN(Date.parse(d))),
  currency: z.string().regex(/^[A-Z]{3}$/),
};

/**
 * Format checks for PM-entered values (email, date, currency). Missing
 * required sub-fields are NOT an error here — saving a partial value is
 * allowed and simply leaves the attribute "partial".
 */
export function validateAttributeValues(
  attribute: BriefAttributeDefinition,
  values: BriefAttributeValues
): string | null {
  for (const subField of attribute.subFields) {
    const value = values[subField.id];
    const check = FORMAT_CHECKS[subField.type];
    if (check && typeof value === "string" && !check.safeParse(value).success) {
      return formatError(subField);
    }
    if (subField.type === "milestones" && Array.isArray(value)) {
      const badDate = value.find((m) => m.date !== null && Number.isNaN(Date.parse(m.date)));
      if (badDate) return `${subField.label}: "${badDate.name}" has an invalid date.`;
    }
  }
  return null;
}

/**
 * For AI-extracted values: blanks out any sub-field that fails its format
 * check (e.g. a date that isn't yyyy-mm-dd) rather than rejecting the whole
 * attribute — a PM fills the gap in.
 */
export function dropInvalidAttributeValues(
  attribute: BriefAttributeDefinition,
  values: BriefAttributeValues
): BriefAttributeValues {
  return Object.fromEntries(
    attribute.subFields.map((subField) => {
      const value = values[subField.id];
      const check = FORMAT_CHECKS[subField.type];
      const invalid = check && typeof value === "string" && !check.safeParse(value).success;
      return [subField.id, invalid ? null : value];
    })
  );
}

/** Whether any sub-field has a value. */
export function hasAnyAttributeValue(
  attribute: BriefAttributeDefinition,
  values: BriefAttributeValues
): boolean {
  return attribute.subFields.some((subField) => {
    const value = values[subField.id];
    return Array.isArray(value) ? value.length > 0 : value != null;
  });
}

/** Order-insensitive equality of two normalized value objects. */
export function attributeValuesEqual(a: BriefAttributeValues, b: BriefAttributeValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null)
  );
}

/**
 * Overlays newly-found values onto what's already known, sub-field by
 * sub-field: a later source that only restates the amount keeps the
 * earlier currency.
 */
export function mergeAttributeValues(
  attribute: BriefAttributeDefinition,
  base: BriefAttributeValues,
  incoming: BriefAttributeValues
): BriefAttributeValues {
  return Object.fromEntries(
    attribute.subFields.map((subField) => {
      const next = incoming[subField.id];
      const hasNext =
        subField.type === "milestones" ? Array.isArray(next) && next.length > 0 : next != null;
      return [
        subField.id,
        hasNext ? next : (base[subField.id] ?? normalizeSubField(subField, null)),
      ];
    })
  );
}

/** Values submitted from the attribute form: one field per sub-field id, milestones as JSON. */
export function attributeValuesFromFormData(
  attribute: BriefAttributeDefinition,
  formData: FormData
): BriefAttributeValues {
  const raw: Record<string, unknown> = {};
  for (const subField of attribute.subFields) {
    const entry = formData.get(subField.id);
    if (subField.type === "milestones") {
      try {
        raw[subField.id] = typeof entry === "string" && entry ? JSON.parse(entry) : [];
      } catch {
        raw[subField.id] = [];
      }
    } else {
      raw[subField.id] = typeof entry === "string" ? entry : null;
    }
  }
  return normalizeAttributeValues(attribute, raw);
}
