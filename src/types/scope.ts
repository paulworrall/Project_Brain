import * as z from "zod";

/**
 * FB-009: the Scope summary — one document, the single source of truth for
 * scope. Stored as a DocumentVersion (type SCOPE_SUMMARY) with the content
 * below. Key details (budget, objective, timeline, scope…) are NOT stored
 * here: they live only in the key-details record, and the Scope summary
 * shows them read-only in their sections (see SCOPE_SECTIONS), so nothing is
 * recorded twice.
 */
export const ScopeSummaryContentSchema = z.object({
  context: z
    .string()
    .describe(
      "Two to four plain sentences: the client, the situation and why this work is needed."
    ),
  outOfScope: z
    .array(z.string())
    .describe("What is explicitly not part of this work. Empty if nothing is stated."),
  deliverables: z.array(z.string()).describe("What will be handed over, one item each."),
  constraints: z
    .array(z.string())
    .describe(
      "Constraints beyond the dates and budget (dependencies, approvals, brand or legal limits)."
    ),
  assumptions: z
    .array(z.string())
    .describe("What we are assuming that the client hasn't confirmed."),
  openQuestions: z
    .array(z.string())
    .describe(
      "Questions the client still needs to answer (including anything they flagged as TBC), excluding the key details listed separately."
    ),
});
export type ScopeSummaryContent = z.infer<typeof ScopeSummaryContentSchema>;

/** The stored sections, as their ids. */
export type ScopeStoredSectionId = keyof ScopeSummaryContent;

/** Every section the Scope summary shows, in order. */
export type ScopeSectionId =
  | "context"
  | "objectives"
  | "inScope"
  | "outOfScope"
  | "deliverables"
  | "timelineAndConstraints"
  | "assumptions"
  | "openQuestions";

export interface ScopeSectionDefinition {
  id: ScopeSectionId;
  label: string;
  /** Stored field this section edits (null: key details only). */
  stored: ScopeStoredSectionId | null;
  /** Key details shown read-only in this section (edited under "What We Need to Find Out"). */
  keyDetailIds: string[];
}

export const SCOPE_SECTIONS: readonly ScopeSectionDefinition[] = [
  { id: "context", label: "Context", stored: "context", keyDetailIds: [] },
  { id: "objectives", label: "Objectives", stored: null, keyDetailIds: ["objective"] },
  {
    id: "inScope",
    label: "In scope",
    stored: null,
    keyDetailIds: ["scope", "markets", "languages", "channels"],
  },
  { id: "outOfScope", label: "Out of scope", stored: "outOfScope", keyDetailIds: [] },
  { id: "deliverables", label: "Deliverables", stored: "deliverables", keyDetailIds: [] },
  {
    id: "timelineAndConstraints",
    label: "Timeline and constraints",
    stored: "constraints",
    keyDetailIds: ["timeline", "budget"],
  },
  { id: "assumptions", label: "Assumptions", stored: "assumptions", keyDetailIds: [] },
  // Open questions also lists the required key details still outstanding (derived).
  { id: "openQuestions", label: "Open questions", stored: "openQuestions", keyDetailIds: [] },
];

export const EMPTY_SCOPE_SUMMARY: ScopeSummaryContent = {
  context: "",
  outOfScope: [],
  deliverables: [],
  constraints: [],
  assumptions: [],
  openQuestions: [],
};

/** The labels of the stored sections whose content differs between two versions. */
export function changedScopeSections(
  before: ScopeSummaryContent | null,
  after: ScopeSummaryContent
): string[] {
  return SCOPE_SECTIONS.filter((section) => {
    if (!section.stored) return false;
    const a = before ? before[section.stored] : section.stored === "context" ? "" : [];
    const b = after[section.stored];
    return JSON.stringify(a) !== JSON.stringify(b);
  }).map((section) => section.label);
}

/** Trims every field and drops empty list items. */
export function normaliseScopeSummary(content: ScopeSummaryContent): ScopeSummaryContent {
  const list = (items: string[]) => items.map((i) => i.trim()).filter(Boolean);
  return {
    context: content.context.trim(),
    outOfScope: list(content.outOfScope),
    deliverables: list(content.deliverables),
    constraints: list(content.constraints),
    assumptions: list(content.assumptions),
    openQuestions: list(content.openQuestions),
  };
}
