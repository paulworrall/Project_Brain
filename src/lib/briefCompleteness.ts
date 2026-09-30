import { prisma } from "@/lib/prisma";
import { PHASES } from "@/lib/phases";
import {
  BRIEF_ATTRIBUTES,
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeDefinition,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import { attributeValuesEqual, normalizeAttributeValues } from "@/lib/briefAttributeValues";
import type { BriefAttributeSource, BriefAttributeValueKind } from "@/generated/prisma/enums";

export type BriefAttributeStatus = "missing" | "partial" | "confirmed";

/** One stored BriefAttributeValue row, as this module needs it. */
export interface BriefAttributeValueRecord {
  id: string;
  attributeId: string;
  kind: BriefAttributeValueKind;
  source: BriefAttributeSource;
  values: unknown;
  evidence: string | null;
  knowledgeItemId?: string | null;
  createdAt: Date;
  createdByName: string | null;
}

/**
 * Where the current value came from, for its source tag: the brief, an
 * update (its version number — the brief is v1, so updates start at v2;
 * null when it can't be told — and whether it came from our internal team
 * rather than the client), or a PM's own edit.
 */
export type BriefAttributeOrigin =
  | { kind: "brief" }
  | { kind: "update"; number: number | null; internalTeam: boolean }
  | { kind: "pm" };

/** What getBriefCompleteness knows about an update: its version and who it came from. */
export interface UpdateVersionRef {
  number: number | null;
  internalTeam: boolean;
}

export interface BriefAttributeEntry {
  id: string;
  values: BriefAttributeValues;
  source: BriefAttributeSource;
  origin: BriefAttributeOrigin;
  /** The passage the value was read from (captured values only). */
  evidence: string | null;
  createdAt: Date;
  createdByName: string | null;
}

export interface BriefAttributeCompleteness {
  id: string;
  label: string;
  question: string;
  required: boolean;
  status: BriefAttributeStatus;
  /**
   * The current value: the latest thing anyone told us — captured by the
   * agent from the brief or an update, or edited by a PM. Trusted as-is; no
   * approval step. Status is based on it.
   */
  current: BriefAttributeEntry | null;
  /** Required sub-fields not filled in the current value. */
  missingSubFields: { id: string; label: string }[];
}

export interface BriefCompleteness {
  /** Every configured attribute, in config order. */
  attributes: BriefAttributeCompleteness[];
  /** Required attributes that aren't fully captured yet (missing or partial). */
  requiredOutstanding: BriefAttributeCompleteness[];
  allRequiredConfirmed: boolean;
  /** Whether gated steps (currently: Generate SOW) may go ahead. Optional attributes never affect it. */
  canProceed: boolean;
  /** The project had already moved past Phase 1 — it isn't locked out of anything, it gets warnings. */
  isPastPhase1: boolean;
  /** For projects past Phase 1: one line per outstanding required attribute. */
  warnings: string[];
  /** Set when the latest attempt to read key details from the brief/inputs failed — so it's never silent. */
  extractionFailure: { at: Date; message: string } | null;
}

const LAST_PHASE_1_STAGE = Math.max(...PHASES[0].stageNumbers);

function newest<T extends { createdAt: Date }>(records: T[]): T | undefined {
  return records.reduce<T | undefined>(
    (latest, record) => (!latest || record.createdAt > latest.createdAt ? record : latest),
    undefined
  );
}

function updateRefOf(ref: number | UpdateVersionRef | undefined): UpdateVersionRef {
  if (typeof ref === "number") return { number: ref, internalTeam: false };
  return ref ?? { number: null, internalTeam: false };
}

function originOf(
  record: BriefAttributeValueRecord,
  updates: ReadonlyMap<string, number | UpdateVersionRef>
): BriefAttributeOrigin {
  switch (record.source) {
    case "BRIEF":
      return { kind: "brief" };
    case "UPDATE":
    case "CLARIFICATION_ANSWER":
      return {
        kind: "update",
        ...updateRefOf(record.knowledgeItemId ? updates.get(record.knowledgeItemId) : undefined),
      };
    case "PM_ENTRY":
      return { kind: "pm" };
  }
}

/**
 * Values accepted in the retired "Review and confirm" flow were saved as
 * CONFIRMED rows that kept the suggestion's source but not its update link
 * or passage. Recover both from the newest earlier suggestion of the same
 * source with the same values. Rows that already have a link are unchanged.
 */
function withRecoveredUpdateLink(
  record: BriefAttributeValueRecord,
  own: BriefAttributeValueRecord[],
  definition: BriefAttributeDefinition
): BriefAttributeValueRecord {
  const fromAnUpdate = record.source === "UPDATE" || record.source === "CLARIFICATION_ANSWER";
  if (record.kind !== "CONFIRMED" || !fromAnUpdate || record.knowledgeItemId) return record;
  const values = normalizeAttributeValues(definition, record.values);
  const original = newest(
    own.filter(
      (r) =>
        r.kind === "SUGGESTION" &&
        r.source === record.source &&
        r.knowledgeItemId &&
        r.createdAt < record.createdAt &&
        attributeValuesEqual(normalizeAttributeValues(definition, r.values), values)
    )
  );
  return original
    ? { ...record, knowledgeItemId: original.knowledgeItemId, evidence: record.evidence ?? original.evidence }
    : record;
}

/**
 * The pure core of getBriefCompleteness — exported for tests. The latest
 * row wins, whoever wrote it: a value the agent captured counts straight
 * away, and a PM edit replaces it until newer information arrives.
 * `updates` maps a knowledge item id to its version (and source); a plain
 * number means a client update with that version.
 */
export function evaluateBriefCompleteness(
  records: BriefAttributeValueRecord[],
  project: {
    currentStageNumber: number;
    keyAttributeExtractionFailedAt?: Date | null;
    keyAttributeExtractionError?: string | null;
  },
  updates: ReadonlyMap<string, number | UpdateVersionRef> = new Map()
): BriefCompleteness {
  const attributes = BRIEF_ATTRIBUTES.map((definition): BriefAttributeCompleteness => {
    const own = records.filter((r) => r.attributeId === definition.id);
    // SUGGESTION + PM_ENTRY rows came from the retired PM perspective link
    // (Early KPIs). Any left over are ignored, so they never count.
    const newestRow = newest(own.filter((r) => !(r.kind === "SUGGESTION" && r.source === "PM_ENTRY")));
    const latest = newestRow && withRecoveredUpdateLink(newestRow, own, definition);

    const entry = (record: BriefAttributeValueRecord): BriefAttributeEntry => ({
      id: record.id,
      values: normalizeAttributeValues(definition, record.values),
      source: record.source,
      origin: originOf(record, updates),
      evidence: record.evidence,
      createdAt: record.createdAt,
      createdByName: record.createdByName,
    });
    const current = latest ? entry(latest) : null;

    // confirmed = every required sub-field filled; partial = something is
    // filled but not every required sub-field (counting optional ones too,
    // so e.g. an end date with no start date reads "partial", not
    // "missing"); missing = nothing at all (including a PM clearing it).
    const requiredSubFields = definition.subFields.filter((f) => f.required);
    const isFilled = (f: (typeof definition.subFields)[number]) =>
      !!current && isSubFieldFilled(f, current.values[f.id]);
    const filled = requiredSubFields.filter(isFilled);
    const anythingFilled = definition.subFields.some(isFilled);
    const status: BriefAttributeStatus =
      filled.length === requiredSubFields.length && anythingFilled
        ? "confirmed"
        : anythingFilled
          ? "partial"
          : "missing";

    return {
      id: definition.id,
      label: definition.label,
      question: definition.question,
      required: definition.required,
      status,
      current,
      missingSubFields: requiredSubFields
        .filter((f) => !filled.includes(f))
        .map((f) => ({ id: f.id, label: f.label })),
    };
  });

  const requiredOutstanding = attributes.filter((a) => a.required && a.status !== "confirmed");
  const allRequiredConfirmed = requiredOutstanding.length === 0;
  const isPastPhase1 = project.currentStageNumber > LAST_PHASE_1_STAGE;

  return {
    attributes,
    requiredOutstanding,
    allRequiredConfirmed,
    canProceed: allRequiredConfirmed,
    isPastPhase1,
    warnings: isPastPhase1 ? requiredOutstanding.map((a) => `${a.label} is ${a.status}`) : [],
    extractionFailure: project.keyAttributeExtractionFailedAt
      ? {
          at: project.keyAttributeExtractionFailedAt,
          message: project.keyAttributeExtractionError ?? "Key details couldn't be read.",
        }
      : null,
  };
}

/**
 * The one place brief completeness is decided. Returns every configured
 * attribute's status, current value (with where it came from) and missing
 * sub-fields, plus the overall canProceed flag that gated steps check (the
 * Generate SOW gate today). Always scoped to one project.
 */
export async function getBriefCompleteness(projectId: string): Promise<BriefCompleteness> {
  const [project, rows, knowledgeItems] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        currentStageNumber: true,
        keyAttributeExtractionFailedAt: true,
        keyAttributeExtractionError: true,
      },
    }),
    prisma.briefAttributeValue.findMany({
      where: { projectId },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.knowledgeItem.findMany({
      where: { projectId },
      select: { id: true, versionNumber: true, source: true },
    }),
  ]);

  return evaluateBriefCompleteness(
    rows
      .filter((row) => getBriefAttribute(row.attributeId))
      .map((row) => ({
        id: row.id,
        attributeId: row.attributeId,
        kind: row.kind,
        source: row.source,
        values: row.values,
        evidence: row.evidence,
        knowledgeItemId: row.knowledgeItemId,
        createdAt: row.createdAt,
        createdByName: row.createdBy?.name ?? null,
      })),
    project,
    new Map(
      knowledgeItems.map((item) => [
        item.id,
        { number: item.versionNumber, internalTeam: item.source === "INTERNAL_TEAM" },
      ])
    )
  );
}
