import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BriefAttributeSource } from "@/generated/prisma/enums";
import { getBriefAttribute, type BriefAttributeValues } from "@/lib/briefAttributes";
import { attributeValuesEqual, mergeAttributeValues } from "@/lib/briefAttributeValues";
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
