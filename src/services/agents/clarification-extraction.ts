import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { PositionDocumentFieldsSchema, type PositionDocumentFields } from "@/types/intake";

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
 * returns an updated Position Document: resolved gaps move into
 * "whatWeKnow", client-confirmed decisions move out of
 * "clientFlaggedOpenItems", and anything still unresolved (or newly
 * surfaced) stays flagged. Never silently drops an unresolved item.
 */
export async function extractClarificationUpdate(
  currentPositionDocument: PositionDocumentFields,
  clarificationNotes: string
): Promise<PositionDocumentFields> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(PositionDocumentFieldsSchema) },
      messages: [
        {
          role: "user",
          content: `Here is the current Position Document for this project:\n\n<position_document>\n${JSON.stringify(currentPositionDocument, null, 2)}\n</position_document>\n\nThe client has now replied with the following clarification notes:\n\n<client_reply>\n${clarificationNotes}\n</client_reply>\n\nProduce an updated Position Document. For anything the reply resolves: if it was a genuine gap ("whatWeNeedToFindOut"), move it into "whatWeKnow" as a new topic/detail pair and remove it from the gaps list. If it was a client-flagged open item ("clientFlaggedOpenItems") that the client has now decided, move it into "whatWeKnow" and remove it from that list. Anything the reply does not address stays exactly where it was. If the reply raises a brand-new genuine gap or a brand-new still-deciding item, add it to the appropriate list. Keep primaryContactName/primaryContactEmail unless the reply updates them.`,
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
