import {
  evaluateBriefCompleteness,
  type BriefAttributeValueRecord,
  type BriefCompleteness,
} from "@/lib/briefCompleteness";
import { describeValues } from "@/lib/keyDetailsContext";
import type { KeyAttributeExtraction } from "@/services/agents/key-attribute-extraction";

/**
 * What the clarification email asks about — the same fixed set of required
 * key details as the "What We Need to Find Out" checklist, never free-form
 * AI questions. Optional details never make it into the email (they never
 * count against readiness), and the PM's own suggestions are internal, so
 * they're never quoted back to the client.
 */
export interface ClarificationQuestions {
  /** Required details nobody has given us yet (or only in part). */
  toAsk: string[];
  /** Required details captured from the client's own brief or updates, for them to confirm. */
  toConfirm: string[];
}

export function clarificationQuestionsFrom(completeness: BriefCompleteness): ClarificationQuestions {
  const toAsk: string[] = [];
  const toConfirm: string[] = [];

  for (const attribute of completeness.attributes.filter((a) => a.required)) {
    const { current } = attribute;
    if (attribute.status === "missing" || !current) {
      toAsk.push(`${attribute.label} — ${attribute.question}`);
      continue;
    }
    // What we read from the client's own brief or updates goes back to them
    // to check; a PM's own edit doesn't.
    if (current.origin.kind !== "pm") {
      const understood = describeValues(attribute.id, current.values);
      if (understood) toConfirm.push(`${attribute.label} — we understood: ${understood}`);
    }
    if (attribute.status === "partial") {
      toAsk.push(
        `${attribute.label} — still need: ${attribute.missingSubFields.map((f) => f.label).join(", ")}`
      );
    }
  }

  return { toAsk, toConfirm };
}

/**
 * At intake nothing is stored yet: treat what was just read from the brief as
 * captured from the brief, and run it through the one status logic.
 */
export function completenessFromExtraction(extraction: KeyAttributeExtraction | null): BriefCompleteness {
  const now = new Date();
  const records: BriefAttributeValueRecord[] = Object.entries(extraction ?? {}).map(
    ([attributeId, extracted]) => ({
      id: `extracted-${attributeId}`,
      attributeId,
      kind: "SUGGESTION",
      source: "BRIEF",
      values: extracted.values,
      evidence: extracted.evidence,
      createdAt: now,
      createdByName: null,
    })
  );
  return evaluateBriefCompleteness(records, { currentStageNumber: 1 });
}
