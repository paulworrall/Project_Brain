import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { ExtractedRoleLineListSchema, type ExtractedRoleLine } from "@/types/estimates";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { Capability } from "@/generated/prisma/enums";

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
 * Extracts role/level/quantity/unit lines from one capability team's raw
 * estimate content (pasted text, or already-parsed file text — see
 * parseDocumentToText). Deliberately never infers a level that wasn't
 * stated: extractedLevel is null whenever the source text doesn't say one,
 * so the conservative matching gate (src/lib/estimateMatching.ts) can route
 * it to a PM instead of guessing.
 */
export async function extractRolesFromCapabilityInput(
  rawContent: string,
  capability: Capability
): Promise<ExtractedRoleLine[]> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(ExtractedRoleLineListSchema) },
      messages: [
        {
          role: "user",
          content: `The text below is the ${capabilityLabel(capability)} team's estimate input for a project. Extract every distinct role/line item into structured rows: the role/title, the seniority/level ONLY if the text genuinely states or unambiguously implies one (leave it null otherwise — do not guess a "typical" or "most likely" level), and the quantity + unit (e.g. "5 days", "40 hours"). Keep rawRoleText as the exact original phrase for that role so it can be traced back to the source.\n\n<capability_estimate_content>\n${rawContent}\n</capability_estimate_content>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the capability estimate roles.");
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
        "The AI service couldn't read this capability's estimate content. Please try again.",
        error
      );
    }
    throw new EstimateRoleExtractionError(
      "Something went wrong while reading this capability's estimate content.",
      error
    );
  }
}
