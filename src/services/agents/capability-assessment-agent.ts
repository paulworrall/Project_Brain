import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { CapabilityAssessmentSchema, type CapabilityAssessment } from "@/types/capabilities";
import { formatCapabilitiesReferenceForPrompt } from "@/lib/mapCapabilities";

export class CapabilityAssessmentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "CapabilityAssessmentError";
  }
}

/**
 * Suggests which of the 12 fixed MAP capabilities this project will likely
 * need estimates from, based on whatever brief content has been captured so
 * far. Never auto-confirms anything — the Server Action calling this only
 * ever returns suggestions for the PM to accept/adjust in the capability
 * multi-select (CLAUDE.md: agents return structured JSON, humans stay in
 * control of every decision downstream of it).
 */
export async function assessCapabilities(briefContext: string): Promise<CapabilityAssessment> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      output_config: { format: zodOutputFormat(CapabilityAssessmentSchema) },
      messages: [
        {
          role: "user",
          content: `You're helping a Project Manager work out which specialist capability teams to approach for estimates on this project. Match the project's actual needs to the right capabilities below, even where the brief's wording differs from a capability's description — reason about what the work actually involves, don't just keyword-match. Only ever select from this fixed list of 12 capabilities; never invent a new one.\n\n<map_capabilities_reference>\n${formatCapabilitiesReferenceForPrompt()}\n</map_capabilities_reference>\n\n<project_brief_content>\n${briefContext}\n</project_brief_content>\n\nIf the brief content above is thin, vague, or mostly unpopulated, still make your best suggestions but set isLowConfidence to true with a short reason — never present guesses as certain.`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the capability assessment.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new CapabilityAssessmentError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new CapabilityAssessmentError(
        "The AI service couldn't suggest capabilities. Please try again.",
        error
      );
    }
    throw new CapabilityAssessmentError(
      "Something went wrong while suggesting capabilities.",
      error
    );
  }
}
