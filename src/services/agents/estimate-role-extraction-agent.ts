import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { ExtractedRoleLineListSchema, type ExtractedRoleLine } from "@/types/estimates";
import { formatCapabilitiesReferenceForPrompt } from "@/lib/mapCapabilities";

export class EstimateRoleExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "EstimateRoleExtractionError";
  }
}

/**
 * Extracts role/level/capability/quantity/unit lines from one raw batch of
 * pasted/uploaded estimate content — a batch may describe roles across
 * several different capability teams at once, so each role is classified
 * individually rather than the caller tagging the whole batch upfront (see
 * ExtractedRoleLineSchema.extractedCapability). Deliberately never infers a
 * level that wasn't stated: extractedLevel is null whenever the source text
 * doesn't say one, so the conservative matching gate
 * (src/lib/estimateMatching.ts) can route it to a PM instead of guessing.
 */
export async function extractEstimateRoles(rawContent: string): Promise<ExtractedRoleLine[]> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(ExtractedRoleLineListSchema) },
      messages: [
        {
          role: "user",
          content: `Extract every distinct role/line item from the raw estimate text below into structured rows: the role/title, the seniority/level ONLY if the text genuinely states or unambiguously implies one (leave it null otherwise — do not guess a "typical" or "most likely" level), the quantity exactly as stated plus the unit the text used for it (hours, days or weeks — e.g. "5 days" is quantity 5, unit "days"; never convert between units), and which ONE of the 12 fixed MAP capability teams below that specific role most likely belongs to. Keep rawRoleText as the exact original phrase for that role so it can be traced back to the source.\n\nUnits matter for pricing: capture the unit each line actually used and NEVER assume hours. If a line gives no unit, the unit is ambiguous, or it's something other than hours/days/weeks (months, sprints, FTE, a percentage), set unit to null — a PM will confirm it. A unit stated once for a whole table or list (e.g. a column header "Days") applies to every line under it. Put the unit word exactly as written in rawUnitText.\n\n<map_capabilities_reference>\n${formatCapabilitiesReferenceForPrompt()}\n</map_capabilities_reference>\n\n<raw_estimate_content>\n${rawContent}\n</raw_estimate_content>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the estimate roles.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new EstimateRoleExtractionError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new EstimateRoleExtractionError(
        "The AI service couldn't read this estimate content. Please try again.",
        error
      );
    }
    throw new EstimateRoleExtractionError(
      "Something went wrong while reading this estimate content.",
      error
    );
  }
}
