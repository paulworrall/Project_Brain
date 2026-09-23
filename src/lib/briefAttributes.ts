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

export const REQUIRED_BRIEF_ATTRIBUTES = BRIEF_ATTRIBUTES.filter((attribute) => attribute.required);
export const OPTIONAL_BRIEF_ATTRIBUTES = BRIEF_ATTRIBUTES.filter(
  (attribute) => !attribute.required
);

export function getBriefAttribute(id: string): BriefAttributeDefinition | undefined {
  return BRIEF_ATTRIBUTES.find((attribute) => attribute.id === id);
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
