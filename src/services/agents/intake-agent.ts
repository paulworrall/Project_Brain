import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  PM_PERSPECTIVE_POSITION_GUIDANCE,
  pmPerspectivePromptSection,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";
import { keyDetailsExclusionForPrompt } from "@/lib/briefAttributes";
import {
  KeyAttributeExtractionError,
  extractKeyAttributes,
  type KeyAttributeExtraction,
} from "@/services/agents/key-attribute-extraction";
import { generateScopeSummary } from "@/services/agents/scope-summary-agent";
import type { ScopeSummaryContent } from "@/types/scope";
import {
  BriefClassificationSchema,
  PositionDocumentExtractionSchema,
  type BriefClassification,
  type BriefType,
  type IntakeAgentResult,
  type PositionDocumentExtraction,
} from "@/types/intake";

export class IntakeAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "IntakeAgentError";
  }
}

function friendlyErrorFrom(step: string, error: unknown): IntakeAgentError {
  if (error instanceof Anthropic.RateLimitError) {
    return new IntakeAgentError(
      `The AI service is rate-limited right now. Please try ${step} again in a moment.`,
      error
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new IntakeAgentError(
      `The AI service couldn't complete ${step}. Please try again.`,
      error
    );
  }
  return new IntakeAgentError(`Something went wrong during ${step}.`, error);
}

export async function classifyBrief(briefText: string): Promise<BriefClassification> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      output_config: { format: zodOutputFormat(BriefClassificationSchema) },
      messages: [
        {
          role: "user",
          content: `Classify this client brief and summarize it in one or two sentences. Then assess how ready it is to scope and estimate: "complete" if objective, deliverables, timeline and budget are clear enough to confirm the scope now; "thin" if there is too little to scope without a conversation with the client; otherwise "partial". Give up to 3 short reasons (what is missing or unclear).\n\n<brief>\n${briefText}\n</brief>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for brief classification.");
    }
    return message.parsed_output;
  } catch (error) {
    throw friendlyErrorFrom("brief classification", error);
  }
}

export async function extractPositionFields(
  briefText: string,
  briefType: BriefType,
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
          content: `This client brief was classified as ${briefType}. Extract everything it clearly states into "whatWeKnow" as topic/detail pairs. Separately, list the items the client themselves flagged as still-deciding — TBC, "???", "tbd", "still deciding" — in "clientFlaggedOpenItems". Only list what the client explicitly says they don't know yet; don't list things the brief is simply silent on.\n\n${keyDetailsExclusionForPrompt()}\n\n<brief>\n${briefText}\n</brief>${pmPerspectivePromptSection(pmPerspective, PM_PERSPECTIVE_POSITION_GUIDANCE)}`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for field extraction.");
    }
    return message.parsed_output;
  } catch (error) {
    throw friendlyErrorFrom("extracting brief details", error);
  }
}

/**
 * Intake, in order: classify the brief; read its key details (the one
 * record for budget, objective, timeline, contact… — captured straight away);
 * then the Scope summary (FB-009 — replaces the Position Document), which is
 * told to leave those key details out. (FB-011: no clarification email and no
 * set-up checklist are generated any more — PMs write and send their own
 * client emails, and project set-up admin happens outside this site.) A
 * key-detail failure never blocks intake — it's returned so the caller can
 * record it on the project.
 *
 * The PM perspective, if any, goes to the Scope summary as its own labelled
 * block — never into the brief text, and not into
 * classification or key-detail extraction (key details must come from the
 * client).
 */
export async function runIntakeAgent(
  briefText: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<IntakeAgentResult> {
  const classification = await classifyBrief(briefText);

  let keyAttributes: KeyAttributeExtraction | null = null;
  let keyAttributesError: string | null = null;
  try {
    keyAttributes = await extractKeyAttributes(briefText, "brief");
  } catch (error) {
    if (!(error instanceof KeyAttributeExtractionError)) {
      throw error;
    }
    keyAttributesError = error.message;
    console.error("Key attribute extraction failed:", error.cause ?? error);
  }

  let scopeSummary: ScopeSummaryContent;
  try {
    scopeSummary = await generateScopeSummary(
      `This client brief was classified as ${classification.briefType}.\n\n<brief>\n${briefText}\n</brief>`,
      pmPerspective
    );
  } catch (error) {
    throw friendlyErrorFrom("drafting the scope summary", error);
  }

  return { classification, scopeSummary, keyAttributes, keyAttributesError };
}
