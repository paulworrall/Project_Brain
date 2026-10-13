import { prisma } from "@/lib/prisma";
import type { Capability } from "@/generated/prisma/enums";
import { getBriefAttribute, type BriefAttributeValues } from "@/lib/briefAttributes";
import { getBriefCompleteness } from "@/lib/briefCompleteness";
import { normalizeAttributeValues } from "@/lib/briefAttributeValues";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  SOW_MATERIAL_FIELDS,
  buildKeyDetailsSnapshot,
  changedSubFieldIds,
  diffCapabilities,
  parseKeyDetailsSnapshot,
  type SowKeyDetailsSnapshot,
} from "@/lib/sowMaterial";
import { getSowSyncStatus } from "@/lib/sowSync";
import { formatMoney } from "@/lib/sowSyncView";
import { NO_SOW_CHANGE_STATUS, type SowChange, type SowChangeStatus } from "@/lib/sowChangeView";

export type { SowChange, SowChangeStatus, SowChangeState } from "@/lib/sowChangeView";

const SOURCE_LABEL = { CLIENT: "Client", INTERNAL_TEAM: "Internal team" } as const;

/** The material key details and confirmed capabilities as they are right now (what a SOW generated now would be built from). */
export async function snapshotMaterialKeyDetails(projectId: string): Promise<SowKeyDetailsSnapshot> {
  const [completeness, capabilities] = await Promise.all([
    getBriefCompleteness(projectId),
    prisma.projectCapability.findMany({ where: { projectId }, select: { capability: true } }),
  ]);
  const valuesByAttribute: Record<string, BriefAttributeValues | null> = {};
  for (const attribute of completeness.attributes) {
    valuesByAttribute[attribute.id] = attribute.current?.values ?? null;
  }
  return buildKeyDetailsSnapshot(
    valuesByAttribute,
    capabilities.map((c) => c.capability)
  );
}

function fieldLabelsOf(attributeId: string, subFieldIds: string[]): string {
  const definition = getBriefAttribute(attributeId);
  if (!definition) return attributeId;
  const everySubField = subFieldIds.length === definition.subFields.length;
  if (definition.subFields.length === 1 || everySubField) return definition.label;
  const names = definition.subFields.filter((f) => subFieldIds.includes(f.id)).map((f) => f.label.toLowerCase());
  return `${definition.label} (${names.join(", ")})`;
}

/** Material key-detail changes since the snapshot, one entry per update (or PM edit) that caused them. */
async function keyDetailChanges(
  projectId: string,
  snapshot: SowKeyDetailsSnapshot
): Promise<{ changes: SowChange[]; capabilityChange: SowChange | null }> {
  const [now, capabilityRows] = await Promise.all([
    snapshotMaterialKeyDetails(projectId),
    prisma.projectCapability.findMany({ where: { projectId }, select: { capability: true, createdAt: true } }),
  ]);

  // Net change first: a value changed and then put back isn't a change.
  const changedByAttribute = new Map<string, string[]>();
  for (const id of SOW_MATERIAL_FIELDS.attributeIds) {
    const fields = changedSubFieldIds(id, snapshot.attributes[id], now.attributes[id]);
    if (fields.length > 0) changedByAttribute.set(id, fields);
  }

  const changes: SowChange[] = [];
  if (changedByAttribute.size > 0) {
    const rows = await prisma.briefAttributeValue.findMany({
      where: {
        projectId,
        attributeId: { in: [...changedByAttribute.keys()] },
        createdAt: { gt: new Date(snapshot.takenAt) },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        attributeId: true,
        kind: true,
        source: true,
        values: true,
        createdAt: true,
        knowledgeItem: { select: { id: true, versionNumber: true, source: true, changeSummary: true } },
      },
    });

    // Walk each attribute's history from the SOW's own values: every row that
    // changed something is an event; group an update's rows into one entry.
    const previous = new Map<string, BriefAttributeValues>(
      [...changedByAttribute.keys()].map((id) => [id, snapshot.attributes[id] ?? {}])
    );
    const events = new Map<string, SowChange & { _fields: Map<string, string[]> }>();
    for (const row of rows) {
      // Leftover rows from the retired PM-perspective link never counted.
      if (row.kind === "SUGGESTION" && row.source === "PM_ENTRY") continue;
      const definition = getBriefAttribute(row.attributeId);
      if (!definition) continue;
      const values = normalizeAttributeValues(definition, row.values);
      const changed = changedSubFieldIds(row.attributeId, previous.get(row.attributeId), values);
      previous.set(row.attributeId, values);
      if (changed.length === 0) continue;

      const item = row.knowledgeItem;
      const isPm = row.source === "PM_ENTRY";
      const key = item ? `item:${item.id}` : `row:${row.id}`;
      const existing = events.get(key);
      const event =
        existing ??
        ({
          versionLabel: item?.versionNumber ? `v${item.versionNumber}` : isPm ? "PM edit" : "Brief",
          date: row.createdAt,
          source: item ? SOURCE_LABEL[item.source] : isPm ? "PM" : "Client",
          fields: [],
          summary: item?.changeSummary?.trim() ?? "",
          _fields: new Map<string, string[]>(),
        } as SowChange & { _fields: Map<string, string[]> });
      event._fields.set(row.attributeId, [...(event._fields.get(row.attributeId) ?? []), ...changed]);
      if (row.createdAt > (event.date ?? row.createdAt)) event.date = row.createdAt;
      events.set(key, event);
    }

    for (const event of events.values()) {
      event.fields = [...event._fields].map(([id, subFields]) => fieldLabelsOf(id, [...new Set(subFields)]));
      if (!event.summary) {
        event.summary = `${event.fields.join(", ")} ${event.source === "PM" ? "edited by the PM" : "updated"}`;
      }
      const { _fields: _unused, ...change } = event;
      changes.push(change);
    }

    // Net-changed but nothing attributable (shouldn't happen): still say so.
    if (changes.length === 0) {
      changes.push({
        versionLabel: "Key details",
        date: null,
        source: "Project",
        fields: [...changedByAttribute].map(([id, f]) => fieldLabelsOf(id, f)),
        summary: "Key details have changed",
      });
    }
  }

  const { added, removed } = diffCapabilities(snapshot.capabilities, now.capabilities);
  let capabilityChange: SowChange | null = null;
  if (added.length > 0 || removed.length > 0) {
    const addedDates = capabilityRows.filter((r) => added.includes(r.capability)).map((r) => r.createdAt.getTime());
    const parts = [
      added.length > 0 ? `added ${added.map(capabilityLabel).join(", ")}` : null,
      removed.length > 0 ? `removed ${removed.map(capabilityLabel).join(", ")}` : null,
    ].filter(Boolean);
    capabilityChange = {
      versionLabel: "Capabilities",
      date: addedDates.length > 0 ? new Date(Math.max(...addedDates)) : null,
      source: "PM",
      fields: ["Capabilities"],
      summary: `Confirmed capabilities changed: ${parts.join("; ")}`,
    };
  }
  return { changes, capabilityChange };
}

function signed(amount: number, currency: string): string {
  return `${amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(amount), currency)}`;
}

/**
 * The single source of truth for whether the project's SOW still reflects the
 * project — every surface (the notice on the SOW card, the phase-header
 * indicator, the download guard, the estimate page, the version labels) reads
 * this; none works out staleness itself. Derived at read time by comparing the
 * latest SOW version's generation-time record against the project now:
 *   - its key-detail snapshot (SOW_MATERIAL_FIELDS) against the current
 *     values and confirmed capabilities, and
 *   - the estimate version it's pinned to against that estimate's latest
 *     version (via getSowSyncStatus).
 * Nothing is stored. A SOW version made before snapshots existed has no
 * key-detail record, so it's only checked against its estimate — never given
 * a false notice. Every query is scoped by projectId.
 */
export async function getSowChangeStatus(projectId: string): Promise<SowChangeStatus> {
  const sync = await getSowSyncStatus(projectId);
  if (!sync.sow) return NO_SOW_CHANGE_STATUS;

  const latest = await prisma.sOWVersion.findFirst({
    where: { sow: { projectId } },
    orderBy: { versionNumber: "desc" },
    select: { id: true, keyAttributesSnapshot: true },
  });
  const snapshot = parseKeyDetailsSnapshot(latest?.keyAttributesSnapshot);

  const changes: SowChange[] = [];
  if (snapshot) {
    const { changes: keyChanges, capabilityChange } = await keyDetailChanges(projectId, snapshot);
    changes.push(...keyChanges);
    if (capabilityChange) changes.push(capabilityChange);
  }

  const estimate = sync.sow;
  if (estimate.status === "stale" && estimate.source && estimate.current && estimate.diff) {
    const delta = estimate.diff.currencyChange
      ? `currency changed from ${estimate.diff.currencyChange.from} to ${estimate.diff.currencyChange.to}`
      : signed(estimate.diff.totalDelta ?? 0, estimate.current.currency);
    changes.push({
      versionLabel: `Estimate v${estimate.current.versionNumber}`,
      date: estimate.current.savedAt ?? null,
      source: "Estimate",
      fields: ["Estimate"],
      summary: `${estimate.current.estimateLabel} is now ${formatMoney(estimate.current.total, estimate.current.currency)} (${delta}); this SOW used v${estimate.source.versionNumber}`,
    });
  }

  changes.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  return {
    status: changes.length > 0 ? "changed_since_generation" : "up_to_date",
    changes,
    sowVersionId: estimate.sowVersionId,
    sowVersionNumber: estimate.sowVersionNumber,
    estimateSync: estimate,
    versions: sync.versions,
  };
}
