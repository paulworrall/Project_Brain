import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { RateCardLineItemExtractionListSchema, type RateCardLineItemExtraction } from "@/types/estimates";

export class RateCardLineItemAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "RateCardLineItemAgentError";
  }
}

/**
 * Parses a RateCardVersion's already-stored extractedText into structured
 * role/level/rate rows — RateCardVersion itself only ever stores a raw file
 * + one text blob (see FB-001), so this is the only place structured rate
 * card data comes from. Called once per RateCardVersion, from inside
 * analyzeAndBuildEstimateAction, guarded by a "rows already exist?" cache
 * check — never re-parses a version that's already been done.
 */
export async function parseRateCardLineItems(
  extractedText: string
): Promise<RateCardLineItemExtraction[]> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(RateCardLineItemExtractionListSchema) },
      messages: [
        {
          role: "user",
          content: `Extract every distinct role/rate line from the rate card content below into structured rows. For each row, capture the role name exactly as written, the level/seniority ONLY if the card genuinely distinguishes one for that role (leave it null otherwise — never invent a level), the rate type (hourly, daily, or weekly — infer from context if not stated explicitly, e.g. a large flat number is more likely daily than hourly), the numeric rate, and its currency. If a role appears at multiple levels (e.g. "Developer, Junior" and "Developer, Senior" as separate rows), extract each as its own row rather than merging them.\n\n<rate_card_content>\n${extractedText}\n</rate_card_content>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the rate card line items.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new RateCardLineItemAgentError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new RateCardLineItemAgentError(
        "The AI service couldn't read this rate card's line items. Please try again.",
        error
      );
    }
    throw new RateCardLineItemAgentError(
      "Something went wrong while reading the rate card's line items.",
      error
    );
  }
}
