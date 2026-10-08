import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { SowAgentError } from "@/services/agents/sow-agent";
import type { SowExtractionResult } from "@/lib/sowItemsMerge";
import { SOW_REVIEW_SECTIONS, type SowItemDto } from "@/lib/sowReview";

const SectionEnum = z.enum(["DELIVERABLES", "SERVICES", "ASSUMPTIONS", "OUT_OF_SCOPE", "RISKS"]);

export const SowExtractionSchema = z.object({
  newItems: z
    .array(z.object({ section: SectionEnum, text: z.string() }))
    .describe("Candidate items that are not already covered by an existing item."),
  changes: z
    .array(z.object({ itemId: z.string(), text: z.string() }))
    .describe(
      "Proposed revised wording for an EXISTING item, by its id. Empty on a first extraction, and empty unless the project's inputs genuinely changed what the item should say."
    ),
});

/**
 * Step 1 of the SOW split: propose candidate items for the five reviewable
 * sections (Deliverables, Services, Assumptions, Out of Scope, Risks) from the
 * project's inputs. It proposes only — a PM validates the items before
 * anything is composed (see generateSowContent), and on regeneration the
 * server (planExtractionMerge), not this prompt, decides what may be
 * overwritten.
 *
 * `existingItems` is empty on a first extraction. On regeneration it carries
 * every current item with its id so the agent can return only what's new plus
 * proposed rewordings by id — it is never asked to re-emit the whole list.
 */
export async function extractSowItems(
  narrativeContext: string,
  existingItems: readonly SowItemDto[] = []
): Promise<SowExtractionResult> {
  const sectionGuide = SOW_REVIEW_SECTIONS.map((s) => `- ${s.key}: ${s.label} — ${s.hint}`).join("\n");
  const existingBlock =
    existingItems.length > 0
      ? `\n<existing_items>\n${JSON.stringify(
          existingItems.map((i) => ({ id: i.id, section: i.section, text: i.text, included: i.included }))
        )}\n</existing_items>\n\nA PM has already reviewed items for this project. Return ONLY (a) "newItems": genuinely new items the inputs now support that no existing item covers (an existing item reworded is NOT new), and (b) "changes": a revised wording for an existing item, by its id, only where the inputs have materially changed what it should say. Do not repeat items that are fine as they are, and do not re-propose items the PM has excluded. Never invent ids.`
      : `\nThis is the first extraction for this project: return your candidate items in "newItems" and leave "changes" empty.`;

  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(SowExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `You are preparing the scope content for a Statement of Work. A project manager will review every item you propose before any document is written, so propose clear, self-contained, client-appropriate items — each one a single deliverable, service, assumption, exclusion or risk, in one or two sentences.

Sections:
${sectionGuide}

Derive items ONLY from <project_context>: the brief and its updates, the key details, the PM's view, the Position Document, any specialist-review output (the Deliverables & Services Document) and the confirmed specialist capabilities. For Services, consider which capabilities and specialists are included and what each will contribute; name the capability in the item (e.g. "Experience/Creative — concept and design of the campaign landing pages"). Never invent a fact, name, date, figure or commitment that isn't in the context. Where something genuinely isn't known, leave it out rather than guessing.

For OUT_OF_SCOPE, include only boundaries the context implies (what is deliberately absent among the deliverables and services, flagged gaps, risks that imply a boundary). For RISKS, restate the context's own open questions, risks and gaps in client-appropriate language — don't add new ones.

<project_context>
${narrativeContext}
</project_context>
${existingBlock}`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the SOW items.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new SowAgentError("The AI service is rate-limited right now. Please try again in a moment.", error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new SowAgentError("The AI service couldn't prepare the SOW items. Please try again.", error);
    }
    throw new SowAgentError("Something went wrong while preparing the SOW items.", error);
  }
}
