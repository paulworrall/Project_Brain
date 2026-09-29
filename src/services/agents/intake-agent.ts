import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  PM_PERSPECTIVE_POSITION_GUIDANCE,
  pmPerspectivePromptSection,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";
import { CLIENT_CONTACT_FIELDS, keyDetailsExclusionForPrompt } from "@/lib/briefAttributes";
import {
  KeyAttributeExtractionError,
  extractKeyAttributes,
  type KeyAttributeExtraction,
} from "@/services/agents/key-attribute-extraction";
import { removeItemsCoveredByKeyDetails } from "@/services/agents/position-key-detail-filter";
import { describeKnownKeyDetails } from "@/lib/keyDetailsContext";
import {
  clarificationQuestionsFrom,
  completenessFromExtraction,
  type ClarificationQuestions,
} from "@/lib/clarificationQuestions";
import {
  BriefClassificationSchema,
  ClarificationEmailSchema,
  DEFAULT_SETUP_CHECKLIST_ITEMS,
  PositionDocumentExtractionSchema,
  type BriefClassification,
  type BriefType,
  type ClarificationEmail,
  type IntakeAgentResult,
  type PositionDocumentExtraction,
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
 * The questions come from the fixed set of required key details (see
 * clarificationQuestionsFrom) — never generated — plus the client's own
 * still-deciding items from the Position Document.
 */
export async function generateClarificationEmail(
  fields: PositionDocumentExtraction,
  questions: ClarificationQuestions,
  pmPerspective: PmPerspectiveValues = {},
  contactName: string | null = null
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
            contactName ?? "the client contact"
          } if a name is available. In clearly separate, labeled sections, list:\n1. Key details we still need from the client — ask for each one: ${JSON.stringify(questions.toAsk)}\n2. Key details we've read from the brief, for the client to confirm we've understood correctly: ${JSON.stringify(questions.toConfirm)}\n3. Items the client already flagged as still deciding, just to confirm status: ${JSON.stringify(fields.clientFlaggedOpenItems)}\n\nAsk only about the items listed — don't add questions of your own. Leave out any section whose list is empty. If all three lists are empty, write a short note confirming there are no outstanding questions right now instead of an empty email.${pmPerspectivePromptSection(
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
 * Intake, in order: classify the brief; read its key details (the one
 * record for budget, objective, timeline, contact… — stored as suggestions);
 * then the Position Document, which is told to leave those key details out
 * — and then checked, removing anything the key details already cover — so
 * nothing is recorded twice; then the clarification email, addressed to
 * the contact the key details found and asking about the required key
 * details still outstanding. A key-detail failure never blocks
 * intake — it's returned so the caller can record it on the project.
 *
 * The PM perspective, if any, goes to the Position Document and the email as
 * its own labelled block — never into the brief text, and not into
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

  const extractedPosition = await extractPositionFields(briefText, classification.briefType, pmPerspective);
  // The guarantee: anything the key details already cover is removed from
  // "whatWeKnow", so each key detail is recorded once.
  const positionDocument = {
    ...extractedPosition,
    whatWeKnow: await removeItemsCoveredByKeyDetails(
      extractedPosition.whatWeKnow,
      describeKnownKeyDetails(null, keyAttributes)
    ),
  };
  const contactName = keyAttributes?.[CLIENT_CONTACT_FIELDS.attributeId]?.values[CLIENT_CONTACT_FIELDS.name];
  const clarificationEmail = await generateClarificationEmail(
    positionDocument,
    clarificationQuestionsFrom(completenessFromExtraction(keyAttributes)),
    pmPerspective,
    typeof contactName === "string" ? contactName : null
  );
  const checklist = generateSetupChecklist();

  return { classification, positionDocument, clarificationEmail, checklist, keyAttributes, keyAttributesError };
}
