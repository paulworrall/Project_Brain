import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  DeliverablesServicesDocumentSchema,
  type DeliverablesServicesDocument,
} from "@/types/deliverables-services";
import type { DraftScopeDocument } from "@/types/triage";

export class SpecialistReviewExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "SpecialistReviewExtractionError";
  }
}

/**
 * Takes the Draft Scope Document plus freeform specialist-lead feedback and
 * produces the Deliverables + Services Document. The services capability
 * list is fixed (Experience/Creative, Business, Architecture, Tech and
 * Data, Orchestration, Other) — every row is always produced, marked "Not
 * required" where a capability isn't needed, never omitted.
 */
export async function extractDeliverablesAndServices(
  draftScopeDocument: DraftScopeDocument,
  specialistFeedback: string
): Promise<DeliverablesServicesDocument> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(DeliverablesServicesDocumentSchema) },
      messages: [
        {
          role: "user",
          content: `Here is the Draft Scope Document for this project:\n\n<draft_scope_document>\n${JSON.stringify(draftScopeDocument, null, 2)}\n</draft_scope_document>\n\nSpecialist leads have now reviewed it and given the following feedback:\n\n<specialist_feedback>\n${specialistFeedback}\n</specialist_feedback>\n\nProduce the Deliverables + Services Document:\n- "deliverables": the finalized deliverables list, incorporating whatever the specialists changed, added, or confirmed.\n- "services": exactly one entry for each of the five fixed capabilities (experienceCreative, business, architecture, techAndData, orchestration) describing what that capability needs to contribute — write "Not required" if a capability isn't needed for this project — plus an "other" entry for anything that doesn't fit those five, with its own free-text "label" (use "Other" if nothing specific applies).\n- "openQuestionsRisks": open questions or risks the specialists raised.\n- "outstandingGapsCarriedForward": any gaps from the Draft Scope Document's own flaggedGaps that the specialist feedback still hasn't resolved — carry these forward rather than dropping them.`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error(
        "Claude returned no parsed output for the Deliverables + Services Document."
      );
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new SpecialistReviewExtractionError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new SpecialistReviewExtractionError(
        "The AI service couldn't generate the Deliverables + Services Document. Please try again.",
        error
      );
    }
    if (error instanceof SpecialistReviewExtractionError) {
      throw error;
    }
    throw new SpecialistReviewExtractionError(
      "Something went wrong while processing the specialist feedback.",
      error
    );
  }
}
