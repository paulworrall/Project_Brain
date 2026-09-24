import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import type { PositionDocumentExtraction } from "@/types/intake";
import { describeKeyAttributesForPrompt } from "@/lib/briefAttributes";

const CoveredItemsSchema = z.object({
  coveredIndexes: z
    .array(z.number())
    .describe(
      "Indexes of the numbered items whose information is fully contained in the key details."
    ),
});

/**
 * The guarantee behind "each key detail is recorded once": asking the
 * Position Document agent to leave key details out isn't enough on its own
 * (it renames them — e.g. a secondary objective becomes "Secondary benefit
 * sought"), so this separate check is given the actual key-detail values and
 * identifies which "whatWeKnow" items they already fully cover; code then
 * removes exactly those. Anything that adds information beyond the key
 * details is kept. Any failure keeps every item — nothing is ever lost here.
 */
export async function removeItemsCoveredByKeyDetails(
  whatWeKnow: PositionDocumentExtraction["whatWeKnow"],
  keyDetails: string
): Promise<PositionDocumentExtraction["whatWeKnow"]> {
  if (whatWeKnow.length === 0 || !keyDetails.trim()) {
    return whatWeKnow;
  }
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      output_config: { format: zodOutputFormat(CoveredItemsSchema) },
      messages: [
        {
          role: "user",
          content: `A project's key details are recorded in one place. These are the ONLY kinds of key detail:\n${describeKeyAttributesForPrompt()}\n\nThe values recorded for this project:\n<key_details>\n${keyDetails}\n</key_details>\n\nSeparately, a list of other details was captured from the same brief. Mark a numbered item only if BOTH are true:\n1. It is about one of the kinds of key detail above (e.g. an objective or secondary objective, success measures, budget or currency, timeline, dates or milestones, the client contact, scope/approach/deliverables, markets, languages, channels).\n2. Everything it says about that is already in the recorded values above.\nNever mark an item about anything else — brand or client name, audience, background, the concept or idea, partners, what the client is asking the agency for, or how the brief arrived — even if a key-detail value happens to mention it. If an item adds anything the recorded values don't contain, do NOT mark it.\n\n<other_details>\n${whatWeKnow
            .map((item, index) => `${index}. ${item.topic}: ${item.detail}`)
            .join("\n")}\n</other_details>`,
        },
      ],
    });
    const covered = new Set(message.parsed_output?.coveredIndexes ?? []);
    return whatWeKnow.filter((_, index) => !covered.has(index));
  } catch (error) {
    console.error("Key-detail de-duplication failed; keeping every item:", error);
    return whatWeKnow;
  }
}
