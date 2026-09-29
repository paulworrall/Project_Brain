import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  PositionDocumentExtractionSchema,
  type PositionDocumentExtraction,
  type PositionDocumentFields,
} from "@/types/intake";
import { keyDetailsExclusionForPrompt } from "@/lib/briefAttributes";
import {
  PM_PERSPECTIVE_POSITION_GUIDANCE,
  pmPerspectivePromptSection,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";

export class ClarificationExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "ClarificationExtractionError";
  }
}

/**
 * Takes the current Position Document plus the client's freeform reply and
 * returns an updated Position Document: new context goes into "whatWeKnow",
 * client-confirmed decisions move out of "clientFlaggedOpenItems", and
 * anything still unresolved (or newly surfaced) stays flagged. Never
 * silently drops an unresolved item. What still needs finding out isn't
 * part of this — it's derived from the key details.
 */
export async function extractClarificationUpdate(
  currentPositionDocument: PositionDocumentFields,
  clarificationNotes: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<PositionDocumentExtraction> {
  // Only what this agent maintains — older versions may still carry the
  // retired AI-generated gaps list or contact fields.
  const current: PositionDocumentExtraction = {
    whatWeKnow: currentPositionDocument.whatWeKnow,
    clientFlaggedOpenItems: currentPositionDocument.clientFlaggedOpenItems,
  };
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(PositionDocumentExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `Here is the current Position Document for this project:\n\n<position_document>\n${JSON.stringify(current, null, 2)}\n</position_document>\n\nThe client has now replied with the following clarification notes:\n\n<client_reply>\n${clarificationNotes}\n</client_reply>\n\nProduce an updated Position Document. Add anything new the reply clearly states to "whatWeKnow" as topic/detail pairs. If the reply decides a client-flagged open item ("clientFlaggedOpenItems"), move it into "whatWeKnow" and remove it from that list. Anything the reply does not address stays exactly where it was. If the reply raises a brand-new still-deciding item, add it to "clientFlaggedOpenItems".\n\n${keyDetailsExclusionForPrompt()} If the current Position Document already lists any of these in "whatWeKnow", remove them from it.${pmPerspectivePromptSection(pmPerspective, PM_PERSPECTIVE_POSITION_GUIDANCE)}`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for clarification extraction.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new ClarificationExtractionError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new ClarificationExtractionError(
        "The AI service couldn't process these clarification notes. Please try again.",
        error
      );
    }
    if (error instanceof ClarificationExtractionError) {
      throw error;
    }
    throw new ClarificationExtractionError(
      "Something went wrong while processing the clarification notes.",
      error
    );
  }
}
