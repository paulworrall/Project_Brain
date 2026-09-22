import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { SOWDocumentContentSchema, type SOWDocumentContent } from "@/types/sow";

export class SowAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "SowAgentError";
  }
}

/**
 * Drafts fresh SOW narrative content, guided by the selected SOW Template's
 * structure/tone — NOT a mail-merge into the template file (this codebase
 * has no OOXML placeholder-filling; officeparser only extracts plain text
 * from it). Same "agent drafts structured JSON -> deterministic docx
 * renderer" pattern as every other generated document here (see
 * sow-docx.ts). Cover details (client name, job code, dates, commercials)
 * are deliberately NOT part of this call's output — those are assembled as
 * plain data in generateSowAction, the same discipline
 * EstimateDocumentContentSchema.overview already enforces.
 */
export async function generateSowContent(
  narrativeContext: string,
  templateStructureGuidance: string
): Promise<SOWDocumentContent> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(SOWDocumentContentSchema) },
      messages: [
        {
          role: "user",
          content: `Draft the body of a Statement of Work for this project — real, complete client-facing content, not a placeholder. This is always a draft for internal review before it ever reaches a client, but write it in professional, client-ready language regardless.

Use ONLY <project_context> as your source of facts (deliverables, dates, scope, risks, contacts, pricing). Never invent a fact — a name, a date, a figure, a deliverable — that isn't present in <project_context>. Where something genuinely isn't known, omit it or state it as an open item rather than guessing.

Use <sow_template_structure_guidance> only for structure, section ordering, and tone — it's the text extracted from this client's SOW template document. Do not copy its boilerplate/legal language verbatim, and never treat it as a source of facts about this specific project.

For "outOfScope": synthesize from what's deliberately absent among the deliverables/services in the context, from flagged gaps, and from risks that imply a boundary — every item must trace back to something in the context, never invent a boundary the source material doesn't imply.

For "risks": restate the context's own open questions/risks/gaps in client-appropriate language — don't add new ones.

<project_context>
${narrativeContext}
</project_context>

<sow_template_structure_guidance>
${templateStructureGuidance}
</sow_template_structure_guidance>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the SOW.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new SowAgentError("The AI service is rate-limited right now. Please try again in a moment.", error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new SowAgentError("The AI service couldn't generate the SOW. Please try again.", error);
    }
    throw new SowAgentError("Something went wrong while generating the SOW.", error);
  }
}
