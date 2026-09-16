import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { EstimateBriefContentSchema, type EstimateBriefContent } from "@/types/capabilities";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { Capability } from "@/generated/prisma/enums";

export class EstimateBriefAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "EstimateBriefAgentError";
  }
}

/**
 * Generates the structured content behind the estimate brief .docx — a
 * shared project-overview section plus one section per confirmed capability
 * describing what's expected of them to estimate against. Rendering that
 * content into an actual .docx is a separate, deterministic step (see
 * estimate-brief-docx.ts) — this call only ever returns structured JSON, per
 * CLAUDE.md's agent rules.
 */
export async function generateEstimateBriefContent(
  briefContext: string,
  confirmedCapabilities: Capability[]
): Promise<EstimateBriefContent> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(EstimateBriefContentSchema) },
      messages: [
        {
          role: "user",
          content: `Draft a brief for the specialist capability teams below, so each can produce an estimate for this project. Write one shared project-overview section (context, what's known so far, timeline, constraints) that every capability will read, followed by one section per capability describing specifically what's expected of them to estimate against — grounded in the brief content, not generic boilerplate. Produce a complete, useful brief even where information is missing; state reasonable assumptions explicitly rather than leaving a section empty.\n\nCapabilities to write a section for, in this order: ${confirmedCapabilities.map(capabilityLabel).join(", ")}.\n\n<project_brief_content>\n${briefContext}\n</project_brief_content>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the estimate brief.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new EstimateBriefAgentError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new EstimateBriefAgentError(
        "The AI service couldn't generate the estimate brief. Please try again.",
        error
      );
    }
    throw new EstimateBriefAgentError(
      "Something went wrong while generating the estimate brief.",
      error
    );
  }
}
