import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { DraftScopeDocumentSchema, type DraftScopeDocument } from "@/types/triage";
import type { PositionDocumentFields } from "@/types/intake";

export class TriageAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "TriageAgentError";
  }
}

/**
 * Generates the Draft Scope Document from the current Position Document.
 * Always produces a complete draft regardless of remaining gaps — gaps are
 * carried forward into "flaggedGaps" for specialists, never used to block
 * generation.
 */
export async function generateDraftScopeDocument(
  positionDocument: PositionDocumentFields
): Promise<DraftScopeDocument> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(DraftScopeDocumentSchema) },
      messages: [
        {
          role: "user",
          content: `Based on this project's Position Document, draft a Scope Document covering objectives, deliverables, milestones, roles & responsibilities (contacts plus the specialist capabilities this project will likely need), budget, and assumptions/constraints. Proceed and produce a complete, useful draft even where information is missing — infer reasonable assumptions where sensible and state them explicitly in "assumptionsAndConstraints". Separately, list every remaining genuine gap and client-flagged open item from the Position Document in "flaggedGaps" so specialists reviewing this draft know exactly what's still unresolved. Do not omit a gap just because you made an assumption about it — flag it either way.\n\n<position_document>\n${JSON.stringify(positionDocument, null, 2)}\n</position_document>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the Draft Scope Document.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new TriageAgentError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new TriageAgentError(
        "The AI service couldn't generate the Draft Scope Document. Please try again.",
        error
      );
    }
    if (error instanceof TriageAgentError) {
      throw error;
    }
    throw new TriageAgentError(
      "Something went wrong while generating the Draft Scope Document.",
      error
    );
  }
}
