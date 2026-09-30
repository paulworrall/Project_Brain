import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  DeliverablesServicesDocumentSchema,
  type DeliverablesServicesDocument,
} from "@/types/deliverables-services";
import type { EstimateBriefContent } from "@/types/capabilities";

export class SpecialistReviewExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "SpecialistReviewExtractionError";
  }
}

/** What the specialist leads reviewed, and what was still unresolved. */
export interface SpecialistReviewInput {
  /** The latest Estimate Brief — what the capability teams were briefed on. */
  estimateBrief: EstimateBriefContent;
  /** Required key details still missing or partial, and client-flagged open items. */
  outstandingGaps: string[];
  /** The shared project context (getProjectContext): brief, every update, key details, PM's view. */
  projectContext?: string;
}

/**
 * Takes the latest Estimate Brief (plus the gaps still open) and freeform
 * specialist-lead feedback, and produces the Deliverables + Services Document. The services capability
 * list is fixed (Experience/Creative, Business, Architecture, Tech and
 * Data, Orchestration, Other) — every row is always produced, marked "Not
 * required" where a capability isn't needed, never omitted.
 */
export async function extractDeliverablesAndServices(
  input: SpecialistReviewInput,
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
          content: `${input.projectContext?.trim() ? `Background — everything known about this project (the brief, updates in version order, key details, and the PM's own view, which is internal):\n\n<project_context>\n${input.projectContext}\n</project_context>\n\n` : ""}Here is the Estimate Brief the capability teams were given for this project:\n\n<estimate_brief>\n${JSON.stringify(input.estimateBrief, null, 2)}\n</estimate_brief>\n\nThese gaps were still open (required key details not yet fully captured, and items the client flagged as still deciding):\n\n<outstanding_gaps>\n${input.outstandingGaps.length > 0 ? input.outstandingGaps.map((gap) => `- ${gap}`).join("\n") : "None."}\n</outstanding_gaps>\n\nSpecialist leads have now reviewed it and given the following feedback:\n\n<specialist_feedback>\n${specialistFeedback}\n</specialist_feedback>\n\nProduce the Deliverables + Services Document:\n- "deliverables": the finalized deliverables list, incorporating whatever the specialists changed, added, or confirmed.\n- "services": exactly one entry for each of the five fixed capabilities (experienceCreative, business, architecture, techAndData, orchestration) describing what that capability needs to contribute — write "Not required" if a capability isn't needed for this project — plus an "other" entry for anything that doesn't fit those five, with its own free-text "label" (use "Other" if nothing specific applies).\n- "openQuestionsRisks": open questions or risks the specialists raised.\n- "outstandingGapsCarriedForward": any of the outstanding gaps above that the specialist feedback still hasn't resolved — carry these forward rather than dropping them.`,
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
