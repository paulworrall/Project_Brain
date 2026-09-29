import { BRIEF_ATTRIBUTES, isSubFieldFilled } from "@/lib/briefAttributes";
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
  /** Required details read from the client's own words, for them to confirm. */
  toConfirm: string[];
}

export function clarificationQuestionsFrom(completeness: BriefCompleteness): ClarificationQuestions {
  const toAsk: string[] = [];
  const toConfirm: string[] = [];

  for (const attribute of completeness.requiredOutstanding) {
    const definition = BRIEF_ATTRIBUTES.find((a) => a.id === attribute.id);
    if (!definition) continue;
    const { suggestion, confirmed } = attribute;

    if (suggestion) {
      const understood = describeValues(attribute.id, suggestion.values);
      if (understood) toConfirm.push(`${attribute.label} — we understood: ${understood}`);
      const stillMissing = definition.subFields
        .filter((f) => f.required && !isSubFieldFilled(f, suggestion.values[f.id]))
        .map((f) => f.label);
      if (stillMissing.length > 0) {
        toAsk.push(`${attribute.label} — still need: ${stillMissing.join(", ")}`);
      }
    } else if (confirmed) {
      toAsk.push(
        `${attribute.label} — still need: ${attribute.missingSubFields.map((f) => f.label).join(", ")}`
      );
    } else {
      toAsk.push(`${attribute.label} — ${attribute.question}`);
    }
  }

  return { toAsk, toConfirm };
}

/**
 * At intake nothing is stored yet: treat what was just read from the brief as
 * pending client suggestions, and run it through the one status logic.
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
