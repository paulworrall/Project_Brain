import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";

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
    .describe("A clear, direct answer grounded only in the provided project context."),
});

/**
 * Assembles everything known about a single project — Documents, ChecklistItems,
 * TouchpointNotes, KnowledgeItems — for the chatbot to answer from. Every query
 * is filtered by `projectId` at the database layer (CLAUDE.md: isolation is
 * never enforced by prompting alone), and every fetched row is re-asserted to
 * belong to that project before being folded into context — an explicit,
 * cheap guard against a future unscoped query anywhere in this function ever
 * leaking another project's data into an answer.
 */
export async function assembleProjectContext(projectId: string): Promise<string> {
  const [documents, checklistItems, touchpointNotes, knowledgeItems] = await Promise.all([
    prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    }),
    prisma.checklistItem.findMany({ where: { projectId } }),
    prisma.touchpointNote.findMany({ where: { projectId } }),
    prisma.knowledgeItem.findMany({ where: { projectId } }),
  ]);

  const sections: string[] = [];

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

  for (const note of touchpointNotes.filter((n) => n.projectId === projectId)) {
    sections.push(`## Touchpoint note — ${note.type}\n${note.content}`);
  }

  for (const item of knowledgeItems.filter((k) => k.projectId === projectId)) {
    sections.push(`## Knowledge item — ${item.title}\n${item.content}`);
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "No documents, notes, or knowledge items exist for this project yet.";
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
          content: `You answer questions about ONE specific project, using ONLY the context below. Never reference, infer, or compare against any other project. If the context doesn't contain the answer, say so plainly rather than guessing.\n\n<project_context>\n${context}\n</project_context>\n\n<question>\n${question}\n</question>`,
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
