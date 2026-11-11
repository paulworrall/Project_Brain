import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

/**
 * FB-008 Project assistant — the one new agent step. Decides whether a
 * message to the assistant is a question (answered by the existing chatbot),
 * an update (run through the existing Keep-up-to-date flow), both, or unclear
 * (the UI then asks the user which they meant). It only classifies and splits;
 * it never answers or writes anything itself.
 */

export class AssistantClassifierError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AssistantClassifierError";
  }
}

// `intent` is a plain string, not z.enum: zodOutputFormat doesn't enforce enums,
// so the value is checked in normaliseIntent (anything unknown → "unclear").
export const AssistantIntentOutputSchema = z.object({
  intent: z
    .string()
    .describe(
      'Exactly one of "question", "update", "both", "unclear". question: asks for information about the project. update: tells us something new about the project (a decision, a changed budget/timeline/scope, meeting notes, a client reply). both: does both. unclear: you cannot tell with confidence.'
    ),
  question: z
    .string()
    .nullable()
    .describe(
      "For question/both: the question, reworded only if needed to stand alone. Otherwise null."
    ),
  update: z
    .string()
    .nullable()
    .describe(
      "For update/both: the new information, kept in the user's own words (do not summarise or drop detail). Otherwise null."
    ),
});

type AssistantIntentOutput = z.infer<typeof AssistantIntentOutputSchema>;

/** The routed intent: always one of the four values. */
export interface AssistantIntent {
  intent: "question" | "update" | "both" | "unclear";
  question: string | null;
  update: string | null;
}

export async function classifyAssistantMessage(message: string): Promise<AssistantIntent> {
  let parsed: AssistantIntentOutput | null;
  try {
    const response = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      output_config: { format: zodOutputFormat(AssistantIntentOutputSchema) },
      messages: [
        {
          role: "user",
          content: `A project team member typed this into their project's assistant. Classify it.\n\n- "question" if they want to know something about the project.\n- "update" if they are telling us something new about the project that should be recorded (e.g. "The client confirmed the budget is now £60k", pasted meeting notes, a client's reply).\n- "both" if the message clearly does both — split it into the question and the update.\n- "unclear" if you can't tell with confidence. Prefer "unclear" to guessing: a wrong update changes the project record.\n\nNever answer the question yourself.\n\n<message>\n${message}\n</message>`,
        },
      ],
    });
    parsed = response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AssistantClassifierError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    throw new AssistantClassifierError(
      "The assistant couldn't read that message. Please try again.",
      error
    );
  }
  if (!parsed) {
    throw new AssistantClassifierError(
      "The assistant couldn't read that message. Please try again."
    );
  }
  return normaliseIntent(parsed, message);
}

/**
 * Makes the classifier's output safe to route on: a "both" or single intent
 * with its part missing falls back to the whole message, so nothing the user
 * typed is lost.
 */
export function normaliseIntent(intent: AssistantIntentOutput, message: string): AssistantIntent {
  const question = intent.question?.trim() || null;
  const update = intent.update?.trim() || null;
  switch (intent.intent.trim().toLowerCase()) {
    case "question":
      return { intent: "question", question: question ?? message, update: null };
    case "update":
      return { intent: "update", question: null, update: update ?? message };
    case "both":
      if (!question && !update) return { intent: "unclear", question: null, update: null };
      if (!update) return { intent: "question", question: question ?? message, update: null };
      if (!question) return { intent: "update", question: null, update };
      return { intent: "both", question, update };
    default:
      return { intent: "unclear", question: null, update: null };
  }
}
