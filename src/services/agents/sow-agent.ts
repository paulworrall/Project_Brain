import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { SOWNarrativeSchema, type SOWDocumentContent, type SOWValidatedLists } from "@/types/sow";

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
 * Step 4 of the SOW split — composition. Writes the SOW around the PM-validated
 * items (see sow-extraction-agent.ts for the proposing step and SowSectionItem
 * for the validation). The agent produces only the surrounding narrative —
 * scope summary, milestones, roles — guided by the selected SOW Template's
 * structure/tone (NOT a mail-merge into the template file: this codebase has
 * no OOXML placeholder-filling; officeparser only extracts plain text from
 * it). The five validated lists are copied into the result verbatim, so
 * composition cannot add, drop or reword a deliverable, service, assumption,
 * exclusion or risk — that guarantee is structural, not just a prompt rule.
 *
 * Cover details (client name, job code, dates, commercials) are deliberately
 * NOT part of this call's output either — those are assembled as plain data
 * in generateSowAction, the same discipline EstimateDocumentContentSchema.overview
 * already enforces.
 */
export async function generateSowContent(
  narrativeContext: string,
  templateStructureGuidance: string,
  validated: SOWValidatedLists
): Promise<SOWDocumentContent> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(SOWNarrativeSchema) },
      messages: [
        {
          role: "user",
          content: `Draft the narrative parts of a Statement of Work for this project — the scope summary (objectives and background), the milestones, and the roles & responsibilities. Write real, complete client-facing content, not a placeholder. This is always a draft for internal review before it ever reaches a client, but write it in professional, client-ready language regardless.

The SOW's Deliverables, Services, Assumptions, Out of Scope and Risks sections have already been validated by the project manager (see <validated_scope>) and will be inserted into the document exactly as written. Do NOT restate them as lists and do NOT add, remove or contradict any of them: your scope summary and background may refer to the validated scope, but must not introduce any deliverable, service, assumption, exclusion or risk that isn't in it.

Use ONLY <project_context> and <validated_scope> as your source of facts (dates, scope, contacts). Never invent a fact — a name, a date, a figure, a deliverable — that isn't present in them. Where something genuinely isn't known, omit it or state it as an open item rather than guessing. For milestones and roles, use only what the context actually names.

Use <sow_template_structure_guidance> only for structure, section ordering, and tone — it's the text extracted from this client's SOW template document. Do not copy its boilerplate/legal language verbatim, and never treat it as a source of facts about this specific project.

<project_context>
${narrativeContext}
</project_context>

<validated_scope>
${JSON.stringify(validated)}
</validated_scope>

<sow_template_structure_guidance>
${templateStructureGuidance}
</sow_template_structure_guidance>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the SOW.");
    }
    // The validated lists are authoritative: copied in, never taken from the model.
    return { ...message.parsed_output, ...validated };
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
