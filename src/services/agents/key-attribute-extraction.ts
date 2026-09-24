import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  BRIEF_ATTRIBUTES,
  describeKeyAttributeFieldsForPrompt,
  type BriefAttributeValues,
  type BriefMilestone,
} from "@/lib/briefAttributes";
import {
  dropInvalidAttributeValues,
  hasAnyAttributeValue,
  normalizeAttributeValues,
} from "@/lib/briefAttributeValues";

export class KeyAttributeExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "KeyAttributeExtractionError";
  }
}

export type KeyAttributeSourceKind = "brief" | "update";

export interface ExtractedKeyAttribute {
  values: BriefAttributeValues;
  evidence: string | null;
}

/** attributeId -> what this text states about it; attributes it doesn't mention are absent. */
export type KeyAttributeExtraction = Record<string, ExtractedKeyAttribute>;

/**
 * Deliberately one small, flat shape — a list of facts — rather than a
 * nested object per attribute: the nested version compiled to a grammar the
 * API rejected ("compiled grammar is too large"), and a flat list stays the
 * same size however many attributes the config grows to. Valid ids come
 * from the config via the prompt and are validated in code below.
 */
export const KeyAttributeExtractionSchema = z.object({
  facts: z
    .array(
      z.object({
        field: z
          .string()
          .describe('One id from the list, exactly as written, e.g. "budget.amount"'),
        value: z.string().describe("The value exactly as the text states it"),
        date: z
          .string()
          .nullable()
          .describe("Milestones only: yyyy-mm-dd, or null. null for every other sub-field."),
        evidence: z
          .string()
          .nullable()
          .describe("The short passage (under 30 words) the value was read from"),
      })
    )
    .describe("One entry per key-detail value the text actually states. Empty if none."),
});

const SOURCE_DESCRIPTION: Record<KeyAttributeSourceKind, string> = {
  brief: "the client's original project brief",
  update: "a later update about the project (call notes, an email reply, or a document)",
};

type RawFact = z.infer<typeof KeyAttributeExtractionSchema>["facts"][number];

/** Groups validated facts into per-attribute values, dropping unknown ids and badly formatted values. */
function factsToExtraction(rawFacts: RawFact[]): KeyAttributeExtraction {
  const facts = rawFacts.map((f) => {
    const [attributeId, subFieldId] = f.field.trim().split(".");
    return { ...f, attributeId, subFieldId };
  });
  const result: KeyAttributeExtraction = {};
  for (const attribute of BRIEF_ATTRIBUTES) {
    const own = facts.filter((f) => f.attributeId === attribute.id);
    const raw: Record<string, unknown> = {};
    for (const subField of attribute.subFields) {
      const matching = own.filter((f) => f.subFieldId === subField.id);
      if (subField.type === "milestones") {
        raw[subField.id] = matching.map((f): BriefMilestone => ({ name: f.value, date: f.date }));
      } else if (matching.length > 0) {
        raw[subField.id] = matching[0].value;
      }
    }
    const values = dropInvalidAttributeValues(attribute, normalizeAttributeValues(attribute, raw));
    if (!hasAnyAttributeValue(attribute, values)) continue;
    const evidence = own.map((f) => f.evidence?.trim()).find(Boolean) ?? null;
    result[attribute.id] = { values, evidence };
  }
  return result;
}

/**
 * Reads one piece of text — the brief, or a later update — and proposes
 * values for each configured key attribute it actually states. Output is
 * only ever stored as a SUGGESTION: a PM confirms it (see
 * confirmBriefAttributeAction). Key details live only there — the Position
 * Document is told to leave them out (see extractPositionFields).
 */
export async function extractKeyAttributes(
  text: string,
  sourceKind: KeyAttributeSourceKind
): Promise<KeyAttributeExtraction> {
  let parsed: z.infer<typeof KeyAttributeExtractionSchema> | null;
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      output_config: { format: zodOutputFormat(KeyAttributeExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `Below is ${SOURCE_DESCRIPTION[sourceKind]}. Record the project's key details it actually states, as a list of facts. Each fact's "field" is one id from this list, written exactly as shown:\n\n${describeKeyAttributeFieldsForPrompt()}\n\nRules:\n- A person reviews every value before it's used, so never guess, infer a "typical" value, or fill anything from general knowledge. Leave out anything not stated.\n- Keep amounts and wording as written.\n- Combine everything the text says about one sub-field into a single fact — e.g. if it gives a main and a secondary objective, put both in the one objective.objective value (main first); never create a second objective.\n- Dates must be yyyy-mm-dd; if the text only gives a month or a vague time ("Q4", "autumn"), leave the date out and mention it in evidence.\n- Only use ids from the list above.\n\n<text>\n${text}\n</text>`,
        },
      ],
    });
    parsed = message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new KeyAttributeExtractionError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new KeyAttributeExtractionError(
        "The AI service couldn't read the key details. Please try again.",
        error
      );
    }
    throw new KeyAttributeExtractionError(
      "Something went wrong while reading the key details.",
      error
    );
  }

  if (!parsed) {
    throw new KeyAttributeExtractionError("Claude returned no key details.");
  }
  return factsToExtraction(parsed.facts);
}
