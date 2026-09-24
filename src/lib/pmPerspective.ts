/**
 * The PM perspective: the consultancy thinking a PM brings to a brief from
 * day one — kept strictly separate from the client's words. Defined here
 * once (like src/lib/briefAttributes.ts); stored per field in
 * PmPerspectiveEntry, never merged into the brief text; and handed to
 * agents only through formatPmPerspectiveForPrompt, which labels it as the
 * PM's view. Prisma-free so client components can use it.
 */

export interface PmPerspectiveFieldDefinition {
  id: string;
  label: string;
  /** Short prompt shown under the input to encourage the PM to fill it in. */
  helper: string;
}

export const PM_PERSPECTIVE_FIELDS: readonly PmPerspectiveFieldDefinition[] = [
  {
    id: "context",
    label: "Context",
    helper:
      "What you know that isn't in the brief — client history, politics, previous work, constraints.",
  },
  {
    id: "initialThoughts",
    label: "Initial thoughts",
    helper: "Your first read of the brief — what stands out, what worries you.",
  },
  {
    id: "proposedSolution",
    label: "Proposed solution",
    helper: "Your early view of the approach, however rough.",
  },
  {
    id: "consultancyGuidance",
    label: "Consultancy guidance",
    helper: "Where MAP can add value beyond what was asked.",
  },
  {
    id: "earlyKpis",
    label: "Early KPIs",
    helper:
      "Success measures you think should apply. Offered as a suggestion for the Objective's success measures.",
  },
];

/** fieldId -> content. Missing or blank means the PM hasn't said anything for that field. */
export type PmPerspectiveValues = Record<string, string>;

export const PM_PERSPECTIVE_PROMPT_TAG = "pm_perspective";

/** The prefix used for each field's input on the New Project form. */
export const PM_PERSPECTIVE_INPUT_PREFIX = "pm_";

export function getPmPerspectiveField(id: string): PmPerspectiveFieldDefinition | undefined {
  return PM_PERSPECTIVE_FIELDS.find((field) => field.id === id);
}

export function hasPmPerspective(values: PmPerspectiveValues): boolean {
  return PM_PERSPECTIVE_FIELDS.some((field) => (values[field.id] ?? "").trim().length > 0);
}

/**
 * The only way the PM perspective reaches an agent: its own labelled block,
 * separate from the brief, with a standing instruction that it's the PM's
 * internal view and never something the client said. Returns "" when
 * there's nothing to pass, so prompts carry no empty block.
 */
export function formatPmPerspectiveForPrompt(values: PmPerspectiveValues): string {
  const filled = PM_PERSPECTIVE_FIELDS.flatMap((field) => {
    const content = (values[field.id] ?? "").trim();
    return content ? [`${field.label}:\n${content}`] : [];
  });
  if (filled.length === 0) {
    return "";
  }
  return [
    `<${PM_PERSPECTIVE_PROMPT_TAG}>`,
    "This is the Project Manager's own view — internal consultancy thinking, not information from the client. Use it to inform your reasoning, but never present anything in it as something the client said, never attribute it to the client, and never quote it in anything addressed to the client.",
    "",
    filled.join("\n\n"),
    `</${PM_PERSPECTIVE_PROMPT_TAG}>`,
  ].join("\n");
}

/**
 * A prompt suffix: the labelled PM block followed by an agent-specific
 * instruction on how to use it — or "" when there's no PM perspective.
 */
export function pmPerspectivePromptSection(values: PmPerspectiveValues, howToUse: string): string {
  const block = formatPmPerspectiveForPrompt(values);
  return block ? `\n\n${block}\n\n${howToUse}` : "";
}

/** Tells a Position Document agent to keep "whatWeKnow" to the client's words. */
export const PM_PERSPECTIVE_POSITION_GUIDANCE =
  'The PM perspective above may help you judge which genuine gaps are worth asking about, but "whatWeKnow" must contain only what the brief itself states (or the client has since said) — never add the PM\'s views to "whatWeKnow" or "clientFlaggedOpenItems".';

/** Reads every field from its prefixed input (e.g. "pm_context"), trimmed; blanks as "". */
export function pmPerspectiveValuesFromFormData(formData: FormData): PmPerspectiveValues {
  return Object.fromEntries(
    PM_PERSPECTIVE_FIELDS.map((field) => {
      const entry = formData.get(`${PM_PERSPECTIVE_INPUT_PREFIX}${field.id}`);
      return [field.id, typeof entry === "string" ? entry.trim() : ""];
    })
  );
}
