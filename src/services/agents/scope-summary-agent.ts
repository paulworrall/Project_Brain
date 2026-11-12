import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { keyDetailsExclusionForPrompt } from "@/lib/briefAttributes";
import { pmPerspectivePromptSection, type PmPerspectiveValues } from "@/lib/pmPerspective";
import {
  ScopeSummaryContentSchema,
  changedScopeSections,
  normaliseScopeSummary,
  type ScopeSummaryContent,
} from "@/types/scope";

/**
 * FB-009 Scope summary agent: three small structured calls sharing one output
 * shape — draft from the brief (intake, regenerate), apply an update, and
 * merge a pre-FB-009 project's Position Document / Draft Scope into v1. It
 * never writes key details (they're shown in the summary from the key-details
 * record), and it never sends or decides anything.
 */

export class ScopeSummaryAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "ScopeSummaryAgentError";
  }
}

const PM_GUIDANCE =
  "The PM perspective above may help you judge what to list as an assumption or open question, but every section must reflect what the client has said — never present the PM's views as the client's.";

const RULES = `Rules:
- Write plain, short items; one idea per item.
- Use only what the material states. Don't invent deliverables, dates or numbers.
- "openQuestions": questions the client still needs to answer, including anything they flagged as TBC or still deciding. Leave out the key details listed below — they are tracked separately.
- ${keyDetailsExclusionForPrompt()}`;

function friendly(step: string, error: unknown): ScopeSummaryAgentError {
  if (error instanceof ScopeSummaryAgentError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new ScopeSummaryAgentError(
      `The AI service is rate-limited right now. Please try ${step} again in a moment.`,
      error
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new ScopeSummaryAgentError(
      `The AI service couldn't complete ${step}. Please try again.`,
      error
    );
  }
  return new ScopeSummaryAgentError(`Something went wrong during ${step}.`, error);
}

async function call<T extends z.ZodType>(
  schema: T,
  prompt: string,
  step: string
): Promise<z.infer<T>> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (!message.parsed_output) {
      throw new ScopeSummaryAgentError(`Claude returned no parsed output for ${step}.`);
    }
    return message.parsed_output as z.infer<T>;
  } catch (error) {
    throw friendly(step, error);
  }
}

/** A Scope summary drafted from the brief (intake) or from everything known (regenerate). */
export async function generateScopeSummary(
  material: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<ScopeSummaryContent> {
  const result = await call(
    ScopeSummaryContentSchema,
    `Write the scope summary for this client project from the material below.\n\n${RULES}\n\n<material>\n${material}\n</material>${pmPerspectivePromptSection(pmPerspective, PM_GUIDANCE)}`,
    "drafting the scope summary"
  );
  return normaliseScopeSummary(result);
}

/** A new version of the Scope summary after an update, and which sections it changed. */
export async function updateScopeSummary(
  current: ScopeSummaryContent,
  update: string,
  projectContext: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<{ content: ScopeSummaryContent; changedSections: string[] }> {
  const result = await call(
    ScopeSummaryContentSchema,
    `Here is a project's current scope summary and something new the team has just learned. Return the full updated scope summary. Change only what the new information changes; keep everything else exactly as it is. Remove any open question the new information answers.\n\n${RULES}\n\n<current_scope_summary>\n${JSON.stringify(current)}\n</current_scope_summary>\n\n<new_information>\n${update}\n</new_information>\n\nBackground (for reference only):\n<project_context>\n${projectContext}\n</project_context>${pmPerspectivePromptSection(pmPerspective, PM_GUIDANCE)}`,
    "updating the scope summary"
  );
  const content = normaliseScopeSummary(result);
  return { content, changedSections: changedScopeSections(current, content) };
}

/** v1 for a project created before FB-009, merged from its earlier documents. */
export async function mergeEarlierDocuments(
  earlierDocuments: string,
  projectContext: string,
  pmPerspective: PmPerspectiveValues = {}
): Promise<ScopeSummaryContent> {
  const result = await call(
    ScopeSummaryContentSchema,
    `This project was set up before scope summaries existed. Merge its earlier documents into one scope summary, using the project context to fill in what they leave out. Where they disagree, prefer the most recent information.\n\n${RULES}\n\n<earlier_documents>\n${earlierDocuments}\n</earlier_documents>\n\n<project_context>\n${projectContext}\n</project_context>${pmPerspectivePromptSection(pmPerspective, PM_GUIDANCE)}`,
    "creating the scope summary"
  );
  return normaliseScopeSummary(result);
}
