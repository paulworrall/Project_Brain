import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getProjectContext } from "@/lib/projectContext";

export class ChatbotError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "ChatbotError";
  }
}

const ChatbotAnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      "A short, direct answer grounded only in the provided project context — 1-3 sentences by default, no preamble, no restating the question, unless the question genuinely requires a list or breakdown."
    ),
});

/**
 * Assembles everything known about a single project — the shared project
 * context (brief, every update, key details, PM perspective), plus the
 * generated Documents, ChecklistItems and specialist feedback — for the
 * chatbot to answer from, fresh on every question. Every query
 * is filtered by `projectId` at the database layer (CLAUDE.md: isolation is
 * never enforced by prompting alone), and every fetched row is re-asserted to
 * belong to that project before being folded into context — an explicit,
 * cheap guard against a future unscoped query anywhere in this function ever
 * leaking another project's data into an answer.
 */
export async function assembleProjectContext(projectId: string): Promise<string> {
  const [context, documents, checklistItems, specialistNotes] = await Promise.all([
    // The brief, every update in version order, key details and the PM's
    // view — the same context every agent uses, so answers always reflect
    // the latest update. Scoped by projectId at the query layer.
    getProjectContext(projectId),
    prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    }),
    prisma.checklistItem.findMany({ where: { projectId } }),
    // Updates come from the context above; client-reply notes are old
    // duplicate copies of them, so only specialist feedback is read here.
    prisma.touchpointNote.findMany({
      where: { projectId, type: "SPECIALIST_REVIEW" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const sections: string[] = [context.text];

  for (const document of documents.filter((d) => d.projectId === projectId)) {
    const latestVersion = document.versions[0];
    if (!latestVersion) continue;
    sections.push(
      `## ${document.type} (version ${latestVersion.versionNumber})\n${JSON.stringify(latestVersion.content)}`
    );
  }

  const scopedChecklistItems = checklistItems.filter((i) => i.projectId === projectId);
  if (scopedChecklistItems.length > 0) {
    sections.push(
      `## Set-Up Checklist\n${scopedChecklistItems
        .map((i) => `- [${i.isComplete ? "x" : " "}] ${i.label}`)
        .join("\n")}`
    );
  }

  for (const note of specialistNotes.filter((n) => n.projectId === projectId)) {
    sections.push(`## Specialist feedback\n${note.content}`);
  }

  return sections.join("\n\n");
}

/** One Claude call answering `question` using only `context` — no DB access of its own. */
export async function answerQuestionFromContext(
  context: string,
  question: string
): Promise<string> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      output_config: { format: zodOutputFormat(ChatbotAnswerSchema) },
      messages: [
        {
          role: "user",
          content: `You're answering a quick question from a project team member who is already looking at this project's page — they don't need background restated. Use ONLY the context below.\n\nAnswer style — this is a chat message, not a report:\n- Lead with the direct answer in the first sentence. No preamble like "Based on the context..." or restating the question.\n- Keep it concise: 1-3 short sentences by default. Only go longer if the question explicitly asks for a list, comparison, or full breakdown.\n- If there's a material caveat or open item, fold it into a short clause on the same answer (e.g. "£50k, but it's not yet confirmed whether that includes production.") — don't give it its own paragraph of explanation.\n- Never reference, infer, or compare against any other project.\n- If the context doesn't contain the answer, say so in one short sentence rather than guessing or padding.\n\n<project_context>\n${context}\n</project_context>\n\n<question>\n${question}\n</question>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for the chatbot answer.");
    }
    return message.parsed_output.answer;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new ChatbotError(
        "The AI service is rate-limited right now. Please try asking again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new ChatbotError("The AI service couldn't answer that. Please try again.", error);
    }
    throw new ChatbotError("Something went wrong answering that question.", error);
  }
}

export async function answerProjectQuestion(
  projectId: string,
  question: string
): Promise<string> {
  const context = await assembleProjectContext(projectId);
  return answerQuestionFromContext(context, question);
}
