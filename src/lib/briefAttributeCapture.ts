import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BriefAttributeSource } from "@/generated/prisma/enums";
import {
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeDefinition,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import {
  attributeValuesEqual,
  mergeAttributeValues,
  normalizeAttributeValues,
} from "@/lib/briefAttributeValues";
import { getBriefCompleteness } from "@/lib/briefCompleteness";
import type { KeyAttributeExtraction } from "@/services/agents/key-attribute-extraction";

export interface KeyAttributeCaptureBatch {
  extraction: KeyAttributeExtraction;
  source: Extract<BriefAttributeSource, "BRIEF" | "UPDATE" | "CLARIFICATION_ANSWER">;
  knowledgeItemId?: string | null;
}

/**
 * - "latest-wins": a brief or update that has just arrived. Whatever it
 *   says replaces what's known — including a PM's edit — sub-field by
 *   sub-field; details it doesn't mention are left alone (extraction only
 *   returns what the text actually states).
 * - "fill-gaps": re-reading sources we've already read. Only sub-fields
 *   that were empty before the re-read are filled (later sources winning
 *   among themselves), so re-reading an old brief can never undo a PM's
 *   edit or a later update.
 */
export type KeyAttributeCaptureMode = "latest-wins" | "fill-gaps";

function onlyEmptySubFields(
  attribute: BriefAttributeDefinition,
  current: BriefAttributeValues,
  incoming: BriefAttributeValues
): BriefAttributeValues {
  return Object.fromEntries(
    attribute.subFields.map((f) => [
      f.id,
      isSubFieldFilled(f, current[f.id]) ? null : (incoming[f.id] ?? null),
    ])
  );
}

/**
 * Stores what the agent read as captured values (kind SUGGESTION — the
 * agent's rows; they count straight away, no approval). Batches are applied
 * in order, oldest source first. Skips anything that wouldn't change the
 * current value. Captured timeline dates are written to the project's own
 * date columns too, so the two never disagree.
 */
export async function saveCapturedKeyAttributes(
  projectId: string,
  batches: KeyAttributeCaptureBatch[],
  mode: KeyAttributeCaptureMode = "latest-wins"
): Promise<number> {
  const completeness = await getBriefCompleteness(projectId);
  const before = new Map<string, BriefAttributeValues>(
    completeness.attributes.map((a) => [a.id, a.current?.values ?? {}])
  );
  const known = new Map(before);

  const rows: Prisma.BriefAttributeValueCreateManyInput[] = [];
  const changed = new Map<string, BriefAttributeValues>();
  for (const batch of batches) {
    for (const [attributeId, extracted] of Object.entries(batch.extraction)) {
      const attribute = getBriefAttribute(attributeId);
      const current = known.get(attributeId);
      if (!attribute || !current) continue;

      const incoming =
        mode === "fill-gaps"
          ? onlyEmptySubFields(attribute, before.get(attributeId) ?? {}, extracted.values)
          : extracted.values;
      const merged = mergeAttributeValues(attribute, current, incoming);
      if (attributeValuesEqual(merged, normalizeAttributeValues(attribute, current))) continue;

      rows.push({
        projectId,
        attributeId,
        kind: "SUGGESTION",
        source: batch.source,
        values: merged as Prisma.InputJsonValue,
        evidence: extracted.evidence,
        knowledgeItemId: batch.knowledgeItemId ?? null,
      });
      known.set(attributeId, merged);
      changed.set(attributeId, merged);
    }
  }
  if (rows.length === 0) return 0;

  // The latest row is decided by createdAt, so give rows written in the
  // same instant a strictly increasing timestamp in batch order.
  const now = Date.now();
  const dateColumns: Record<string, Date | null> = {};
  for (const [attributeId, values] of changed) {
    for (const [subFieldId, column] of Object.entries(
      getBriefAttribute(attributeId)?.projectDateFields ?? {}
    )) {
      const value = values[subFieldId];
      if (column && typeof value === "string") dateColumns[column] = new Date(value);
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.briefAttributeValue.createMany({
      data: rows.map((row, index) => ({ ...row, createdAt: new Date(now + index) })),
    });
    if (Object.keys(dateColumns).length > 0) {
      await tx.project.update({ where: { id: projectId }, data: dateColumns });
    }
  });
  return rows.length;
}
