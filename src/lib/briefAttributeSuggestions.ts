import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BriefAttributeSource } from "@/generated/prisma/enums";
import {
  BRIEF_ATTRIBUTES,
  getBriefAttribute,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import {
  attributeValuesEqual,
  mergeAttributeValues,
  normalizeAttributeValues,
} from "@/lib/briefAttributeValues";
import type { PmPerspectiveValues } from "@/lib/pmPerspective";
import { getBriefCompleteness } from "@/lib/briefCompleteness";
import type { KeyAttributeExtraction } from "@/services/agents/key-attribute-extraction";

export interface KeyAttributeSuggestionBatch {
  extraction: KeyAttributeExtraction;
  source: Extract<BriefAttributeSource, "BRIEF" | "UPDATE" | "CLARIFICATION_ANSWER">;
  knowledgeItemId?: string | null;
}

/**
 * Stores extraction results as SUGGESTION rows — never CONFIRMED; only a PM
 * action confirms. Batches are applied in order (oldest source first), each
 * merged sub-field by sub-field over what's already known (the pending
 * suggestion, else the confirmed values), so a later update that only
 * restates the amount keeps the earlier currency. Skips anything that
 * wouldn't change what the PM already sees.
 */
export async function saveKeyAttributeSuggestions(
  projectId: string,
  batches: KeyAttributeSuggestionBatch[]
): Promise<number> {
  const completeness = await getBriefCompleteness(projectId);
  const known = new Map<
    string,
    { base: BriefAttributeValues; confirmed: BriefAttributeValues | null }
  >(
    completeness.attributes.map((a) => [
      a.id,
      {
        base: a.suggestion?.values ?? a.confirmed?.values ?? {},
        confirmed: a.confirmed?.values ?? null,
      },
    ])
  );

  const rows: Prisma.BriefAttributeValueCreateManyInput[] = [];
  for (const batch of batches) {
    for (const [attributeId, extracted] of Object.entries(batch.extraction)) {
      const attribute = getBriefAttribute(attributeId);
      const current = known.get(attributeId);
      if (!attribute || !current) continue;

      const merged = mergeAttributeValues(attribute, current.base, extracted.values);
      const unchanged =
        attributeValuesEqual(merged, current.base) ||
        (current.confirmed !== null && attributeValuesEqual(merged, current.confirmed));
      if (unchanged) continue;

      rows.push({
        projectId,
        attributeId,
        kind: "SUGGESTION",
        source: batch.source,
        values: merged as Prisma.InputJsonValue,
        evidence: extracted.evidence,
        knowledgeItemId: batch.knowledgeItemId ?? null,
      });
      known.set(attributeId, { ...current, base: merged });
    }
  }

  // The latest suggestion is decided by createdAt, so give rows written in
  // the same instant a strictly increasing timestamp in batch order.
  const now = Date.now();
  await prisma.briefAttributeValue.createMany({
    data: rows.map((row, index) => ({ ...row, createdAt: new Date(now + index) })),
  });
  return rows.length;
}

/**
 * Offers PM perspective content as SUGGESTIONS, source PM_ENTRY, for the
 * sub-fields that accept it (pmPerspectiveFieldId in
 * src/lib/briefAttributes.ts — today only the Objective's success
 * measures, from Early KPIs). Each suggestion keeps the attribute's other
 * confirmed sub-fields, so accepting it doesn't blank them. Never
 * confirmed here — a PM still confirms it like any other suggestion.
 * Skips values the PM has already confirmed or already been offered.
 */
export async function savePmPerspectiveSuggestions(
  projectId: string,
  pmPerspective: PmPerspectiveValues,
  userId: string | null
): Promise<number> {
  const completeness = await getBriefCompleteness(projectId);
  const rows: Prisma.BriefAttributeValueCreateManyInput[] = [];

  for (const attribute of BRIEF_ATTRIBUTES) {
    const linked = attribute.subFields.filter((f) => f.pmPerspectiveFieldId);
    const incoming = Object.fromEntries(
      linked.flatMap((f) => {
        const content = (pmPerspective[f.pmPerspectiveFieldId!] ?? "").trim();
        return content ? [[f.id, content]] : [];
      })
    );
    if (Object.keys(incoming).length === 0) continue;

    const current = completeness.attributes.find((a) => a.id === attribute.id);
    const confirmed = current?.confirmed?.values ?? null;
    const values = normalizeAttributeValues(attribute, { ...(confirmed ?? {}), ...incoming });
    const alreadyKnown =
      (confirmed && attributeValuesEqual(values, confirmed)) ||
      (current?.pmSuggestion && attributeValuesEqual(values, current.pmSuggestion.values));
    if (alreadyKnown) continue;

    rows.push({
      projectId,
      attributeId: attribute.id,
      kind: "SUGGESTION",
      source: "PM_ENTRY",
      values: values as Prisma.InputJsonValue,
      createdById: userId,
    });
  }

  if (rows.length > 0) {
    await prisma.briefAttributeValue.createMany({ data: rows });
  }
  return rows.length;
}
