import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  BRIEF_ATTRIBUTES,
  type BriefAttributeDefinition,
  type BriefAttributeValues,
  type BriefSubFieldDefinition,
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

function subFieldSchema(subField: BriefSubFieldDefinition): z.ZodType {
  const description = [subField.label, subField.hint].filter(Boolean).join(" — ");
  switch (subField.type) {
    case "milestones":
      return z
        .array(
          z.object({
            name: z.string(),
            date: z.string().nullable().describe("yyyy-mm-dd, or null"),
          })
        )
        .nullable()
        .describe(`${description}. null if none are stated.`);
    case "date":
      return z.string().nullable().describe(`${description}, as yyyy-mm-dd. null if not stated.`);
    case "currency":
      return z
        .string()
        .nullable()
        .describe(
          `${description}. Only if stated or shown by a symbol (£ = GBP, € = EUR); otherwise null.`
        );
    default:
      return z.string().nullable().describe(`${description}. null if not stated.`);
  }
}

function attributeSchema(attribute: BriefAttributeDefinition) {
  return z
    .object({
      ...Object.fromEntries(
        attribute.subFields.map((subField) => [subField.id, subFieldSchema(subField)])
      ),
      evidence: z
        .string()
        .nullable()
        .describe("The short passage (under 30 words) from the text this was read from."),
    })
    .nullable()
    .describe(
      `${attribute.label}: "${attribute.question}" — null if the text says nothing about it.`
    );
}

/** Built from the config, so a new attribute or sub-field needs no change here. */
export const KeyAttributeExtractionSchema = z.object(
  Object.fromEntries(
    BRIEF_ATTRIBUTES.map((attribute) => [attribute.id, attributeSchema(attribute)])
  )
);

const SOURCE_DESCRIPTION: Record<KeyAttributeSourceKind, string> = {
  brief: "the client's original project brief",
  update: "a later update about the project (call notes, an email reply, or a document)",
};

/**
 * Reads one piece of text — the brief, or a later update — and proposes
 * values for each configured key attribute it actually states. Output is
 * only ever stored as a SUGGESTION: a PM confirms it (see
 * confirmBriefAttributeAction). One dedicated call, separate from the
 * Position Document extraction, which keeps capturing everything else as
 * general brief context.
 */
export async function extractKeyAttributes(
  text: string,
  sourceKind: KeyAttributeSourceKind
): Promise<KeyAttributeExtraction> {
  let parsed: Record<string, unknown> | null;
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      output_config: { format: zodOutputFormat(KeyAttributeExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `Below is ${SOURCE_DESCRIPTION[sourceKind]}. For each key attribute in the output schema, record ONLY what this text actually states. A person will review every value before it's used, so never guess, infer a "typical" value, or fill a field from general knowledge — use null for anything not stated, and null for the whole attribute if the text doesn't mention it. Keep amounts and wording as written. Dates must be yyyy-mm-dd; if the text gives only a month or a vague time ("Q4", "autumn"), leave the date null and mention it in evidence.\n\n<text>\n${text}\n</text>`,
        },
      ],
    });
    parsed = message.parsed_output as Record<string, unknown> | null;
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

  const result: KeyAttributeExtraction = {};
  for (const attribute of BRIEF_ATTRIBUTES) {
    const raw = parsed[attribute.id];
    if (typeof raw !== "object" || raw === null) continue;
    const values = dropInvalidAttributeValues(attribute, normalizeAttributeValues(attribute, raw));
    if (!hasAnyAttributeValue(attribute, values)) continue;
    const evidence = (raw as Record<string, unknown>).evidence;
    result[attribute.id] = {
      values,
      evidence: typeof evidence === "string" && evidence.trim() ? evidence.trim() : null,
    };
  }
  return result;
}
