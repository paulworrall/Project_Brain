import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  PM_PERSPECTIVE_POSITION_GUIDANCE,
  pmPerspectivePromptSection,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";
import {
  BriefClassificationSchema,
  ClarificationEmailSchema,
  DEFAULT_SETUP_CHECKLIST_ITEMS,
  PositionDocumentFieldsSchema,
  type BriefClassification,
  type BriefType,
  type ClarificationEmail,
  type IntakeAgentResult,
  type PositionDocumentFields,
  type SetupChecklist,
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
          content: `Classify this client brief and summarize it in one or two sentences.\n\n<brief>\n${briefText}\n</brief>`,
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
): Promise<PositionDocumentFields> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(PositionDocumentFieldsSchema) },
      messages: [
        {
          role: "user",
          content: `This client brief was classified as ${briefType}. Extract everything it clearly states into "whatWeKnow" as topic/detail pairs. Separately, identify genuine gaps the brief never addresses ("whatWeNeedToFindOut") from items the client themselves flagged as still-deciding — TBC, "???", "tbd", "still deciding" — ("clientFlaggedOpenItems"). These two lists are semantically different: a genuine gap is silence; a client-flagged item is the client explicitly saying they don't know yet. Also extract the name and email of whoever is managing this project on the client side — the project's commercial/governance anchor, referred to as "Client Name" in the app — if stated, otherwise null.\n\n<brief>\n${briefText}\n</brief>${pmPerspectivePromptSection(pmPerspective, PM_PERSPECTIVE_POSITION_GUIDANCE)}`,
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

export async function generateClarificationEmail(
  fields: PositionDocumentFields,
  pmPerspective: PmPerspectiveValues = {}
): Promise<ClarificationEmail> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      output_config: { format: zodOutputFormat(ClarificationEmailSchema) },
      messages: [
        {
          role: "user",
          content: `Draft a polite, professional clarification email to the client, to be reviewed by an account manager before sending — never state or imply it has already been sent. Address it to ${
            fields.primaryContactName ?? "the client contact"
          } if a name is available. In clearly separate, labeled sections, list:\n1. Genuine open questions the agency needs answered: ${JSON.stringify(fields.whatWeNeedToFindOut)}\n2. Items the client already flagged as still deciding, just to confirm status: ${JSON.stringify(fields.clientFlaggedOpenItems)}\n\nIf both lists are empty, write a short note confirming there are no outstanding questions right now instead of an empty email.${pmPerspectivePromptSection(
            pmPerspective,
            "Use the PM perspective above only to judge which questions matter most and how to frame them. It is internal: don't quote it, reveal it, or present it as anything the client said."
          )}`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the clarification email.");
    }
    return message.parsed_output;
  } catch (error) {
    throw friendlyErrorFrom("drafting the clarification email", error);
  }
}

export function generateSetupChecklist(): SetupChecklist {
  return { items: [...DEFAULT_SETUP_CHECKLIST_ITEMS] };
}

/**
 * The PM perspective, if any, goes to the Position Document and the
 * clarification email as its own labelled block — never into the brief
 * text, and not into classification (which is about the brief document
 * itself).
 */
export async function runIntakeAgent(
  briefText: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<IntakeAgentResult> {
  const classification = await classifyBrief(briefText);
  const positionDocument = await extractPositionFields(briefText, classification.briefType, pmPerspective);
  const clarificationEmail = await generateClarificationEmail(positionDocument, pmPerspective);
  const checklist = generateSetupChecklist();

  return { classification, positionDocument, clarificationEmail, checklist };
}
