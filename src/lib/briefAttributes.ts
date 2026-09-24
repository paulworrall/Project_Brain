/**
 * The single definition of what a complete brief must contain. Everything
 * else — the status logic and gate (src/lib/briefCompleteness.ts), the
 * extraction agent's output schema (key-attribute-extraction.ts), form
 * validation, and every label in the UI — is derived from this list. Don't
 * hard-code attribute or sub-field ids anywhere else; add or change them
 * here. Stored values reference these ids as plain strings
 * (BriefAttributeValue.attributeId), so removing an attribute here simply
 * stops its stored values from being read.
 *
 * Plain TypeScript config, deliberately not a database table — same
 * approach as src/lib/phases.ts. No admin UI yet.
 */

export type BriefSubFieldType = "text" | "longText" | "currency" | "date" | "email" | "milestones";

export interface BriefSubFieldDefinition {
  id: string;
  label: string;
  type: BriefSubFieldType;
  /** Required sub-fields decide partial vs confirmed. */
  required: boolean;
  /** Shown under the input, and passed to the extraction agent. */
  hint?: string;
  /**
   * A PM perspective field (src/lib/pmPerspective.ts) whose content is
   * offered as a SUGGESTION for this sub-field, with source PM_ENTRY — still
   * needing PM confirmation. Only sub-fields marked here can ever take a
   * value from the PM perspective; budget, timeline and client contact must
   * come from the client.
   */
  pmPerspectiveFieldId?: string;
}

export interface BriefAttributeDefinition {
  id: string;
  label: string;
  /** The question to ask the client. */
  question: string;
  /** Required attributes must be PM-confirmed before a SOW can be generated. */
  required: boolean;
  subFields: readonly BriefSubFieldDefinition[];
  /**
   * Sub-fields that mirror a Project column, kept in sync both ways:
   * confirming this attribute writes the column, and editing the column in
   * the project summary records a PM entry for this attribute.
   */
  projectDateFields?: Partial<Record<string, "kickOffDate" | "targetCompletionDate">>;
}

/** One entry in a "milestones" sub-field. Dates are ISO yyyy-mm-dd. */
export interface BriefMilestone {
  name: string;
  date: string | null;
}

export type BriefSubFieldValue = string | BriefMilestone[] | null;
/** An attribute's values, keyed by sub-field id. */
export type BriefAttributeValues = Record<string, BriefSubFieldValue>;

export const BRIEF_ATTRIBUTES: readonly BriefAttributeDefinition[] = [
  // --- Required, in priority order -------------------------------------
  {
    id: "budget",
    label: "Budget",
    question: "What is the budget for the project?",
    required: true,
    subFields: [
      {
        id: "amount",
        label: "Amount or range",
        type: "text",
        required: true,
        hint: "e.g. 50,000 or 40,000–60,000",
      },
      {
        id: "currency",
        label: "Currency",
        type: "currency",
        required: true,
        hint: "3-letter code, e.g. GBP",
      },
    ],
  },
  {
    id: "objective",
    label: "Objective",
    question:
      "What is the objective of the project? Do we have OKRs/KPIs or measures we will measure the success of the project against?",
    required: true,
    subFields: [
      { id: "objective", label: "Objective", type: "longText", required: true },
      {
        id: "successMeasures",
        label: "Success measures (OKRs/KPIs)",
        type: "longText",
        required: true,
        hint: "The OKRs/KPIs success will be measured against — or 'None agreed yet'",
      },
    ],
  },
  {
    id: "timeline",
    label: "Timeline and Key Milestones",
    question: "What is the expected timeline? What are the key milestones?",
    required: true,
    subFields: [
      { id: "startDate", label: "Start date", type: "date", required: true },
      { id: "endDate", label: "End date", type: "date", required: false },
      { id: "milestones", label: "Key milestones", type: "milestones", required: false },
    ],
    projectDateFields: { startDate: "kickOffDate", endDate: "targetCompletionDate" },
  },
  {
    id: "clientContact",
    label: "Client Contact",
    question: "Who is the client contact who will be running the project?",
    required: true,
    subFields: [
      { id: "name", label: "Name", type: "text", required: true },
      { id: "role", label: "Role", type: "text", required: false },
      { id: "email", label: "Email", type: "email", required: true },
    ],
  },

  // --- Optional: captured when known, never block progress --------------
  {
    id: "scope",
    label: "Scope",
    question: "What is in and out of scope?",
    required: false,
    subFields: [{ id: "description", label: "Scope", type: "longText", required: true }],
  },
  {
    id: "markets",
    label: "Markets",
    question: "Which markets or regions does the project cover?",
    required: false,
    subFields: [{ id: "markets", label: "Markets", type: "text", required: true }],
  },
  {
    id: "languages",
    label: "Languages",
    question: "Which languages are needed?",
    required: false,
    subFields: [{ id: "languages", label: "Languages", type: "text", required: true }],
  },
  {
    id: "channels",
    label: "Channels",
    question: "Which channels or platforms are in scope?",
    required: false,
    subFields: [{ id: "channels", label: "Channels", type: "text", required: true }],
  },
];

/**
 * Where the client contact lives in the config — for the few places that
 * need a specific contact field (addressing the clarification email, the SOW
 * cover) without hard-coding ids elsewhere.
 */
export const CLIENT_CONTACT_FIELDS = { attributeId: "clientContact", name: "name", email: "email" } as const;

export const REQUIRED_BRIEF_ATTRIBUTES = BRIEF_ATTRIBUTES.filter((attribute) => attribute.required);
export const OPTIONAL_BRIEF_ATTRIBUTES = BRIEF_ATTRIBUTES.filter(
  (attribute) => !attribute.required
);

export function getBriefAttribute(id: string): BriefAttributeDefinition | undefined {
  return BRIEF_ATTRIBUTES.find((attribute) => attribute.id === id);
}

/**
 * One line per attribute.sub-field id, for prompts — e.g.
 * "- budget.amount — Budget: Amount or range (e.g. 50,000 or 40,000–60,000)".
 * Derived from the config, so a new attribute needs no prompt changes.
 */
export function describeKeyAttributeFieldsForPrompt(): string {
  return BRIEF_ATTRIBUTES.flatMap((attribute) =>
    attribute.subFields.map((subField) => {
      const format =
        subField.type === "date"
          ? " (yyyy-mm-dd)"
          : subField.type === "milestones"
            ? " (one fact per milestone: value = the milestone name, date = yyyy-mm-dd or null)"
            : subField.type === "currency"
              ? " (3-letter code)"
              : "";
      const hint = subField.hint ? ` — ${subField.hint}` : "";
      return `- ${attribute.id}.${subField.id} — ${attribute.label}: ${subField.label}${format}${hint}`;
    })
  ).join("\n");
}

/**
 * For the Position Document agents: the key details are captured separately
 * (one record each, in BriefAttributeValue), so they must stay out of
 * "whatWeKnow" — otherwise the same objective or contact ends up in two
 * places. Derived from the config.
 */
export function keyDetailsExclusionForPrompt(): string {
  return `These key details are captured separately, in their own record — never put any of them (or any part of them, e.g. a secondary objective, or the client contact's name, role or email) into "whatWeKnow":\n${describeKeyAttributesForPrompt()}\nIf the text leaves one of them unanswered, it may still appear as a gap in "whatWeNeedToFindOut".`;
}

/** The attributes, by label and question — for telling other agents what's captured as key details. */
export function describeKeyAttributesForPrompt(): string {
  return BRIEF_ATTRIBUTES.map(
    (attribute) =>
      `- ${attribute.label} (${attribute.subFields.map((f) => f.label).join(", ")}): ${attribute.question}`
  ).join("\n");
}

export function isSubFieldFilled(subField: BriefSubFieldDefinition, value: unknown): boolean {
  if (subField.type === "milestones") {
    return (
      Array.isArray(value) &&
      value.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          typeof m.name === "string" &&
          m.name.trim().length > 0
      )
    );
  }
  return typeof value === "string" && value.trim().length > 0;
}
