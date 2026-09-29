import {
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import type { BriefAttributeOrigin, BriefCompleteness } from "@/lib/briefCompleteness";

/** An attribute's filled sub-fields as one line, e.g. "Objective: … · Success measures (OKRs/KPIs): …". */
export function describeValues(attributeId: string, values: BriefAttributeValues): string {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return "";
  return attribute.subFields
    .filter((f) => isSubFieldFilled(f, values[f.id]))
    .map((f) => {
      const value = values[f.id];
      const text = Array.isArray(value)
        ? value.map((m) => (m.date ? `${m.name} (${m.date})` : m.name)).join("; ")
        : value;
      return `${f.label}: ${text}`;
    })
    .join(" · ");
}

/** Where a value came from, in words — for prompts. */
export function describeOrigin(origin: BriefAttributeOrigin): string {
  switch (origin.kind) {
    case "brief":
      return "from the brief";
    case "update":
      return origin.number ? `from update v${origin.number}` : "from an update";
    case "pm":
      return "edited by the PM";
  }
}

/**
 * The project's key details as prompt context — the one record for budget,
 * objective, timeline, contact etc. (the Position Document no longer carries
 * them): each attribute's current value and where it came from. Returns ""
 * when there's nothing to say.
 */
export function formatKeyDetailsForPrompt(completeness: BriefCompleteness): string {
  const lines = completeness.attributes.flatMap((attribute) => {
    if (!attribute.current) return [];
    const text = describeValues(attribute.id, attribute.current.values);
    return text ? [`- ${attribute.label} (${describeOrigin(attribute.current.origin)}): ${text}`] : [];
  });
  return lines.join("\n");
}

/**
 * Key details for the de-duplication check: what's already known for the
 * project plus anything just extracted, one line per attribute. Returns ""
 * when there's nothing.
 */
export function describeKnownKeyDetails(
  completeness: BriefCompleteness | null,
  extraction: Record<string, { values: BriefAttributeValues }> | null
): string {
  const lines: string[] = [];
  if (completeness) {
    const known = formatKeyDetailsForPrompt(completeness);
    if (known) lines.push(known);
  }
  for (const [attributeId, extracted] of Object.entries(extraction ?? {})) {
    const text = describeValues(attributeId, extracted.values);
    const label = getBriefAttribute(attributeId)?.label;
    if (text && label) lines.push(`- ${label}: ${text}`);
  }
  return lines.join("\n");
}

/** A current sub-field value as plain text, or null. */
export function currentText(
  completeness: BriefCompleteness,
  attributeId: string,
  subFieldId: string
): string | null {
  const value = completeness.attributes.find((a) => a.id === attributeId)?.current?.values[
    subFieldId
  ];
  return typeof value === "string" && value.trim() ? value : null;
}
