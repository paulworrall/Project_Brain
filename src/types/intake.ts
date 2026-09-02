import * as z from "zod";

export const BriefTypeEnum = z.enum([
  "DECK",
  "WORD_DOC",
  "PDF",
  "EMAIL",
  "CALL_TRANSCRIPT",
  "OTHER",
]);
export type BriefType = z.infer<typeof BriefTypeEnum>;

export const BriefClassificationSchema = z.object({
  briefType: BriefTypeEnum,
  summary: z
    .string()
    .describe("One or two sentences summarizing what this brief is about."),
});
export type BriefClassification = z.infer<typeof BriefClassificationSchema>;

export const PositionDocumentFieldsSchema = z.object({
  primaryContactName: z
    .string()
    .nullable()
    .describe(
      "The name of the person managing this project on the client side — the project's commercial/governance anchor (referred to as \"Client Name\" in the app, distinct from the client company's name). Null if not stated in the brief."
    ),
  primaryContactEmail: z
    .string()
    .nullable()
    .describe("That same client-side contact's email, or null if not stated in the brief."),
  whatWeKnow: z
    .array(
      z.object({
        topic: z.string().describe("e.g. Objective, Timeline, Budget, Audience"),
        detail: z.string(),
      })
    )
    .describe("Everything the brief clearly states, as topic/detail pairs."),
  whatWeNeedToFindOut: z
    .array(z.string())
    .describe(
      "Genuine gaps: information the agency needs but the brief does not address at all."
    ),
  clientFlaggedOpenItems: z
    .array(z.string())
    .describe(
      "Items the client themselves flagged as undecided (TBC, '???', 'still deciding', etc.) — distinct from genuine gaps."
    ),
});
export type PositionDocumentFields = z.infer<typeof PositionDocumentFieldsSchema>;

export const ClarificationEmailSchema = z.object({
  subject: z.string(),
  bodyText: z
    .string()
    .describe(
      "Plain-text email body. Polite, professional, references the client by name if known. Lists genuine gaps and client-flagged open items in separate, clearly labeled sections."
    ),
});
export type ClarificationEmail = z.infer<typeof ClarificationEmailSchema>;

export const SetupChecklistSchema = z.object({
  items: z.array(z.string()),
});
export type SetupChecklist = z.infer<typeof SetupChecklistSchema>;

export const DEFAULT_SETUP_CHECKLIST_ITEMS: readonly string[] = [
  "Set up Workbook entry",
  "Create project folder",
  "Assign job code",
  "Assign Project Manager",
  "Create Teams channel",
];

export interface IntakeAgentResult {
  classification: BriefClassification;
  positionDocument: PositionDocumentFields;
  clarificationEmail: ClarificationEmail;
  checklist: SetupChecklist;
}
