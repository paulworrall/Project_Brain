import { prisma } from "@/lib/prisma";
import { PHASES } from "@/lib/phases";
import {
  BRIEF_ATTRIBUTES,
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeValues,
} from "@/lib/briefAttributes";
import { normalizeAttributeValues } from "@/lib/briefAttributeValues";
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
  createdAt: Date;
  createdByName: string | null;
}

export interface BriefAttributeEntry {
  id: string;
  values: BriefAttributeValues;
  source: BriefAttributeSource;
  createdAt: Date;
  createdByName: string | null;
}

export interface BriefAttributeSuggestion extends BriefAttributeEntry {
  evidence: string | null;
}

export interface BriefAttributeCompleteness {
  id: string;
  label: string;
  question: string;
  required: boolean;
  status: BriefAttributeStatus;
  /** The latest PM-confirmed values — the only thing status is based on. */
  confirmed: BriefAttributeEntry | null;
  /**
   * The latest client-sourced suggestion (from the brief or an update), if
   * newer than the confirmed values. Never counts as confirmed.
   */
  suggestion: BriefAttributeSuggestion | null;
  /**
   * The latest suggestion from the PM's own perspective (source PM_ENTRY —
   * only possible for a sub-field linked via pmPerspectiveFieldId), kept apart so it's never mistaken for — or hides — what
   * the client said. Also never counts as confirmed.
   */
  pmSuggestion: BriefAttributeSuggestion | null;
  /** Required sub-fields not filled in the confirmed values. */
  missingSubFields: { id: string; label: string }[];
}

export interface BriefCompleteness {
  /** Every configured attribute, in config order. */
  attributes: BriefAttributeCompleteness[];
  /** Required attributes that aren't confirmed yet (missing or partial). */
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

/**
 * The pure core of getBriefCompleteness — exported for tests. Status comes
 * only from PM-confirmed values: an AI suggestion, however complete, is
 * reported alongside but never makes an attribute "partial" or "confirmed".
 */
export function evaluateBriefCompleteness(
  records: BriefAttributeValueRecord[],
  project: {
    currentStageNumber: number;
    keyAttributeExtractionFailedAt?: Date | null;
    keyAttributeExtractionError?: string | null;
  }
): BriefCompleteness {
  const attributes = BRIEF_ATTRIBUTES.map((definition): BriefAttributeCompleteness => {
    const own = records.filter((r) => r.attributeId === definition.id);
    const latestConfirmed = newest(own.filter((r) => r.kind === "CONFIRMED"));
    const suggestions = own.filter((r) => r.kind === "SUGGESTION");
    const latestSuggestion = newest(suggestions.filter((r) => r.source !== "PM_ENTRY"));
    const latestPmSuggestion = newest(suggestions.filter((r) => r.source === "PM_ENTRY"));

    const confirmed: BriefAttributeEntry | null = latestConfirmed
      ? {
          id: latestConfirmed.id,
          values: normalizeAttributeValues(definition, latestConfirmed.values),
          source: latestConfirmed.source,
          createdAt: latestConfirmed.createdAt,
          createdByName: latestConfirmed.createdByName,
        }
      : null;

    const pending = (record: BriefAttributeValueRecord | undefined): BriefAttributeSuggestion | null =>
      record && (!latestConfirmed || record.createdAt > latestConfirmed.createdAt)
        ? {
            id: record.id,
            values: normalizeAttributeValues(definition, record.values),
            source: record.source,
            createdAt: record.createdAt,
            createdByName: record.createdByName,
            evidence: record.evidence,
          }
        : null;
    const suggestion = pending(latestSuggestion);
    const pmSuggestion = pending(latestPmSuggestion);

    // confirmed = every required sub-field filled; partial = something is
    // filled but not every required sub-field (counting optional ones too,
    // so e.g. an end date with no start date reads "partial", not
    // "missing"); missing = nothing confirmed at all.
    const requiredSubFields = definition.subFields.filter((f) => f.required);
    const isFilled = (f: (typeof definition.subFields)[number]) =>
      !!confirmed && isSubFieldFilled(f, confirmed.values[f.id]);
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
      confirmed,
      suggestion,
      pmSuggestion,
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
 * attribute's status, confirmed values, pending AI suggestion and missing
 * sub-fields, plus the overall canProceed flag that gated steps check (the
 * Generate SOW gate today; later the checklist, client email and SOW review
 * will read this too). Always scoped to one project.
 */
export async function getBriefCompleteness(projectId: string): Promise<BriefCompleteness> {
  const [project, rows] = await Promise.all([
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
        createdAt: row.createdAt,
        createdByName: row.createdBy?.name ?? null,
      })),
    project
  );
}
