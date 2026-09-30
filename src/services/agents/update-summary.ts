import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

export class UpdateSummaryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "UpdateSummaryError";
  }
}

const UpdateSummarySchema = z.object({
  summary: z
    .string()
    .describe("One plain line, at most about 15 words, saying what this update tells us."),
  changeSummary: z
    .string()
    .describe(
      'One plain line saying what this update changes against what was known before, e.g. "Budget increased; new milestone added". Say "Nothing new" if it changes nothing.'
    ),
});

export interface UpdateSummary {
  summary: string;
  changeSummary: string;
}

// Summaries are a nice-to-have shown next to the update's label, so don't
// let a slow call hang around.
const SUMMARY_TIMEOUT_MS = 20_000;

const oneLine = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/**
 * A one-line summary of a project update, plus what it changed against
 * everything known before it (`before`: the brief and earlier updates).
 * Runs after the update is saved; callers treat any failure as "no summary".
 */
export async function summariseUpdate({
  content,
  before,
}: {
  content: string;
  before: string;
}): Promise<UpdateSummary> {
  try {
    const message = await anthropic.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 512,
        output_config: { format: zodOutputFormat(UpdateSummarySchema) },
        messages: [
          {
            role: "user",
            content: `A project manager keeps a list of updates to a client brief, each a new version. Here is everything known before this update (the original brief and any earlier updates):\n\n<before>\n${before || "(nothing yet)"}\n</before>\n\nHere is the new update:\n\n<update>\n${content}\n</update>\n\nWrite:\n- "summary": one short line saying what the update tells us (e.g. "Launch moved to March; budget up to £120k"), not that it's an update.\n- "changeSummary": one short line saying what it changes against what was known before (e.g. "Budget increased; new milestone added").\nUse only what the texts say.`,
          },
        ],
      },
      { timeout: SUMMARY_TIMEOUT_MS }
    );
    const summary = oneLine(message.parsed_output?.summary);
    const changeSummary = oneLine(message.parsed_output?.changeSummary);
    if (!summary || !changeSummary) {
      throw new UpdateSummaryError("Claude returned no summary for this update.");
    }
    return { summary, changeSummary };
  } catch (error) {
    if (error instanceof UpdateSummaryError) {
      throw error;
    }
    throw new UpdateSummaryError("Couldn't summarise this update.", error);
  }
}
