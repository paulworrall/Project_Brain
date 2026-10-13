import type { Capability } from "@/generated/prisma/enums";
import { getBriefAttribute, type BriefAttributeValues } from "@/lib/briefAttributes";
import { normalizeAttributeValues } from "@/lib/briefAttributeValues";

// What counts as "material to the SOW" — the ONE place this is defined. The
// "Updates since this SOW was generated" notice (getSowChangeStatus) and the
// snapshot every SOW version records at generation both read this; nothing
// else decides it. Pure and Prisma-free so client code and tests can use it.

export const SOW_MATERIAL_FIELDS = {
  /**
   * Key-detail attributes (ids from src/lib/briefAttributes.ts) whose change
   * affects the SOW: budget (and its currency, which is part of the budget
   * text), timeline (start/end dates, key milestones, launch), objective and
   * scope, and the dimensions the work is delivered across — markets (and
   * phasing by market), languages and channels.
   *
   * Deliberately NOT here: clientContact (who to address, not what's sold).
   * PM perspective edits are never key details, so they can't appear.
   * Updates that change none of these fields produce no notice.
   */
  attributeIds: ["budget", "objective", "timeline", "scope", "markets", "languages", "channels"],
  /** The project's confirmed capabilities (ProjectCapability). */
  capabilities: true,
  /** A newer version of the estimate the SOW is pinned to. */
  pinnedEstimateVersion: true,
} as const;

export function isSowMaterialAttribute(attributeId: string): boolean {
  return (SOW_MATERIAL_FIELDS.attributeIds as readonly string[]).includes(attributeId);
}

/** The material key details and capabilities as they stood when a SOW version was generated. */
export interface SowKeyDetailsSnapshot {
  /** ISO timestamp the snapshot was taken (just before the SOW was composed). */
  takenAt: string;
  /** Normalised values of each material attribute that had any; absent = nothing captured. */
  attributes: Record<string, BriefAttributeValues>;
  capabilities: Capability[];
}

export function buildKeyDetailsSnapshot(
  valuesByAttribute: Record<string, BriefAttributeValues | null | undefined>,
  capabilities: Capability[],
  takenAt: Date = new Date()
): SowKeyDetailsSnapshot {
  const attributes: Record<string, BriefAttributeValues> = {};
  for (const id of SOW_MATERIAL_FIELDS.attributeIds) {
    const definition = getBriefAttribute(id);
    const values = valuesByAttribute[id];
    if (definition && values) attributes[id] = normalizeAttributeValues(definition, values);
  }
  return { takenAt: takenAt.toISOString(), attributes, capabilities: [...capabilities].sort() };
}

/** Reads a stored snapshot; null for versions made before snapshots existed, or anything malformed. */
export function parseKeyDetailsSnapshot(raw: unknown): SowKeyDetailsSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Partial<SowKeyDetailsSnapshot>;
  if (
    typeof candidate.takenAt !== "string" ||
    typeof candidate.attributes !== "object" ||
    candidate.attributes === null ||
    !Array.isArray(candidate.capabilities)
  ) {
    return null;
  }
  return {
    takenAt: candidate.takenAt,
    attributes: candidate.attributes as Record<string, BriefAttributeValues>,
    capabilities: candidate.capabilities as Capability[],
  };
}

/** Ids of the sub-fields whose value differs between two value sets of one attribute. */
export function changedSubFieldIds(
  attributeId: string,
  before: BriefAttributeValues | null | undefined,
  after: BriefAttributeValues | null | undefined
): string[] {
  const definition = getBriefAttribute(attributeId);
  if (!definition) return [];
  const a = normalizeAttributeValues(definition, before ?? {});
  const b = normalizeAttributeValues(definition, after ?? {});
  return definition.subFields
    .filter((subField) => JSON.stringify(a[subField.id] ?? null) !== JSON.stringify(b[subField.id] ?? null))
    .map((subField) => subField.id);
}

export function diffCapabilities(
  before: readonly Capability[],
  after: readonly Capability[]
): { added: Capability[]; removed: Capability[] } {
  return {
    added: after.filter((c) => !before.includes(c)),
    removed: before.filter((c) => !after.includes(c)),
  };
}
