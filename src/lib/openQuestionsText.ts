import type { ScopeViewSection } from "@/lib/scopeSummaryView";

/**
 * FB-011: the Scope summary's open questions as the text the "Copy questions"
 * buttons copy — a plain numbered list a PM can paste into their own email to
 * the client. Pure. The questions are the Open questions section's items
 * (the stored questions plus the required key details still outstanding), so
 * the list always matches what the card shows and what the count says.
 */

export function openQuestionItems(sections: readonly ScopeViewSection[] | null | undefined): string[] {
  const section = sections?.find((s) => s.id === "openQuestions");
  return section ? section.items.map((item) => item.text) : [];
}

/** "1. First question\n2. Second question" — empty string when there are none. */
export function formatQuestionsList(questions: readonly string[]): string {
  return questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
}

export function openQuestionsText(sections: readonly ScopeViewSection[] | null | undefined): string {
  return formatQuestionsList(openQuestionItems(sections));
}
