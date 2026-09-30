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
});

// A summary is a nice-to-have shown next to the update's label, so don't
// let a slow call hang around.
const SUMMARY_TIMEOUT_MS = 20_000;

/**
 * A one-line summary of a project update, shown alongside its date label.
 * Runs after the update is saved; callers treat any failure as "no summary".
 */
export async function summariseUpdate(content: string): Promise<string> {
  try {
    const message = await anthropic.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 256,
        output_config: { format: zodOutputFormat(UpdateSummarySchema) },
        messages: [
          {
            role: "user",
            content: `Summarise this project update from a client or the internal team in one short line for a project manager's list of updates. Say what it tells us (e.g. "Launch moved to March; budget up to £120k"), not that it's an update. Use only what the text says.\n\n<update>\n${content}\n</update>`,
          },
        ],
      },
      { timeout: SUMMARY_TIMEOUT_MS }
    );
    const summary = message.parsed_output?.summary.replace(/\s+/g, " ").trim();
    if (!summary) {
      throw new UpdateSummaryError("Claude returned no summary for this update.");
    }
    return summary;
  } catch (error) {
    if (error instanceof UpdateSummaryError) {
      throw error;
    }
    throw new UpdateSummaryError("Couldn't summarise this update.", error);
  }
}
