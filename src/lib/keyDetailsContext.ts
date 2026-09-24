import {
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import type { BriefCompleteness } from "@/lib/briefCompleteness";

function describeValues(attributeId: string, values: BriefAttributeValues): string {
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

/**
 * The project's key details as prompt context — the one record for budget,
 * objective, timeline, contact etc. (the Position Document no longer carries
 * them). Confirmed values always; unconfirmed suggestions only when asked,
 * and clearly marked as unconfirmed. Returns "" when there's nothing to say.
 */
export function formatKeyDetailsForPrompt(
  completeness: BriefCompleteness,
  { includeUnconfirmed }: { includeUnconfirmed: boolean }
): string {
  const lines = completeness.attributes.flatMap((attribute) => {
    const out: string[] = [];
    if (attribute.confirmed) {
      const text = describeValues(attribute.id, attribute.confirmed.values);
      if (text) out.push(`- ${attribute.label} (confirmed): ${text}`);
    }
    if (includeUnconfirmed) {
      for (const suggestion of [attribute.suggestion, attribute.pmSuggestion]) {
        if (!suggestion) continue;
        const text = describeValues(attribute.id, suggestion.values);
        const from = suggestion.source === "PM_ENTRY" ? "the PM's own view" : "the client";
        if (text) out.push(`- ${attribute.label} (unconfirmed suggestion, from ${from}): ${text}`);
      }
    }
    return out;
  });
  return lines.join("\n");
}

/**
 * Key details for the de-duplication check: what's already known for the
 * project (confirmed values and pending suggestions) plus anything just
 * extracted, one line per attribute. Returns "" when there's nothing.
 */
export function describeKnownKeyDetails(
  completeness: BriefCompleteness | null,
  extraction: Record<string, { values: BriefAttributeValues }> | null
): string {
  const lines: string[] = [];
  if (completeness) {
    const known = formatKeyDetailsForPrompt(completeness, { includeUnconfirmed: true });
    if (known) lines.push(known);
  }
  for (const [attributeId, extracted] of Object.entries(extraction ?? {})) {
    const text = describeValues(attributeId, extracted.values);
    const label = getBriefAttribute(attributeId)?.label;
    if (text && label) lines.push(`- ${label}: ${text}`);
  }
  return lines.join("\n");
}

/** A confirmed sub-field value as plain text, or null. */
export function confirmedText(
  completeness: BriefCompleteness,
  attributeId: string,
  subFieldId: string
): string | null {
  const value = completeness.attributes.find((a) => a.id === attributeId)?.confirmed?.values[
    subFieldId
  ];
  return typeof value === "string" && value.trim() ? value : null;
}
