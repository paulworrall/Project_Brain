import { prisma } from "@/lib/prisma";
import {
  PM_PERSPECTIVE_FIELDS,
  type PmPerspectiveFieldDefinition,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";
import { savePmPerspectiveSuggestions } from "@/lib/briefAttributeSuggestions";
import { BRIEF_ATTRIBUTES } from "@/lib/briefAttributes";

/** PM perspective fields that feed a key attribute (see pmPerspectiveFieldId). */
const PM_LINKED_FIELD_IDS = new Set(
  BRIEF_ATTRIBUTES.flatMap((a) =>
    a.subFields.flatMap((f) => (f.pmPerspectiveFieldId ? [f.pmPerspectiveFieldId] : []))
  )
);

export interface PmPerspectiveFieldView extends PmPerspectiveFieldDefinition {
  /** "" when the PM hasn't written anything for this field. */
  content: string;
  updatedAt: Date | null;
  updatedByName: string | null;
}

/** Every configured field, in config order, with its content and last edit — always scoped to one project. */
export async function getPmPerspective(projectId: string): Promise<PmPerspectiveFieldView[]> {
  const entries = await prisma.pmPerspectiveEntry.findMany({
    where: { projectId },
    include: { updatedBy: { select: { name: true } } },
  });
  return PM_PERSPECTIVE_FIELDS.map((field) => {
    const entry = entries.find((e) => e.fieldId === field.id);
    return {
      ...field,
      content: entry?.content ?? "",
      updatedAt: entry?.updatedAt ?? null,
      updatedByName: entry?.updatedBy?.name ?? null,
    };
  });
}

/** fieldId -> content, for handing to agents via formatPmPerspectiveForPrompt. */
export async function getPmPerspectiveValues(projectId: string): Promise<PmPerspectiveValues> {
  const entries = await prisma.pmPerspectiveEntry.findMany({
    where: { projectId },
    select: { fieldId: true, content: true },
  });
  return Object.fromEntries(entries.map((e) => [e.fieldId, e.content]));
}

/**
 * Saves the given fields, touching only those whose content actually
 * changed — so each field's updatedAt/updatedBy reflect its own last real
 * edit. A field that was never filled in and is still blank gets no row;
 * clearing a filled field is recorded as an edit. Afterwards, re-offers any
 * PM perspective content linked to a key attribute (pmPerspectiveFieldId —
 * none at present) as a PM_ENTRY suggestion. Returns the ids of the fields that changed.
 */
export async function savePmPerspective(
  projectId: string,
  values: PmPerspectiveValues,
  userId: string | null
): Promise<string[]> {
  const existing = await prisma.pmPerspectiveEntry.findMany({ where: { projectId } });
  const changed: string[] = [];

  for (const field of PM_PERSPECTIVE_FIELDS) {
    if (!(field.id in values)) continue;
    const content = values[field.id].trim();
    const current = existing.find((e) => e.fieldId === field.id);
    if ((current?.content ?? "") === content || (!current && !content)) continue;

    await prisma.pmPerspectiveEntry.upsert({
      where: { projectId_fieldId: { projectId, fieldId: field.id } },
      create: { projectId, fieldId: field.id, content, updatedById: userId },
      update: { content, updatedById: userId },
    });
    changed.push(field.id);
  }

  // Only when a field linked to a key attribute changed — editing Context
  // mustn't re-offer KPIs the PM already decided against.
  if (changed.some((fieldId) => PM_LINKED_FIELD_IDS.has(fieldId))) {
    await savePmPerspectiveSuggestions(projectId, await getPmPerspectiveValues(projectId), userId);
  }
  return changed;
}
