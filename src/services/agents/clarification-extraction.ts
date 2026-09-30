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

/** The shared project context as background for a Position Document agent, or "" if there is none. */
function projectContextBlock(projectContext: string): string {
  return projectContext.trim()
    ? `Background — everything known about this project so far (the brief, updates in version order, key details, and the PM's own view):\n\n<project_context>\n${projectContext}\n</project_context>\n\n`
    : "";
}

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
  pmPerspective: PmPerspectiveValues = {},
  /** Everything known before this update (getProjectContext), as background. */
  projectContext = ""
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
          content: `${projectContextBlock(projectContext)}Here is the current Position Document for this project:\n\n<position_document>\n${JSON.stringify(current, null, 2)}\n</position_document>\n\nThe client has now replied with the following clarification notes:\n\n<client_reply>\n${clarificationNotes}\n</client_reply>\n\nProduce an updated Position Document. Add anything new the reply clearly states to "whatWeKnow" as topic/detail pairs. If the reply decides a client-flagged open item ("clientFlaggedOpenItems"), move it into "whatWeKnow" and remove it from that list. Anything the reply does not address stays exactly where it was. If the reply raises a brand-new still-deciding item, add it to "clientFlaggedOpenItems".\n\n${keyDetailsExclusionForPrompt()} If the current Position Document already lists any of these in "whatWeKnow", remove them from it.${pmPerspectivePromptSection(pmPerspective, PM_PERSPECTIVE_POSITION_GUIDANCE)}`,
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

/**
 * Rebuilds the Position Document from the whole project context — the brief
 * and every update in version order — rather than patching the last version
 * with one update. Used by "Regenerate" when the Position Document is stale
 * (e.g. an update's refresh failed, or the PM perspective or key details
 * changed since). Same fields and rules as the per-update refresh.
 */
export async function rebuildPositionDocument(
  projectContext: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<PositionDocumentExtraction> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(PositionDocumentExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `${projectContextBlock(projectContext)}Produce this project's Position Document from everything above. Put everything the brief and the updates clearly state into "whatWeKnow" as topic/detail pairs; where a later update changes something an earlier version said, keep only the latest. List the items the client themselves flagged as still deciding (and that no later update has settled) in "clientFlaggedOpenItems". Only list what the client explicitly says they don't know yet.\n\n${keyDetailsExclusionForPrompt()}${pmPerspectivePromptSection(pmPerspective, PM_PERSPECTIVE_POSITION_GUIDANCE)}`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the Position Document rebuild.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new ClarificationExtractionError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof ClarificationExtractionError) {
      throw error;
    }
    throw new ClarificationExtractionError("Couldn't regenerate the Position Document. Please try again.", error);
  }
}
