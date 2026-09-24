import * as z from "zod";
import type { KeyAttributeExtraction } from "@/services/agents/key-attribute-extraction";

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

/**
 * What the Position Document agents produce: the brief's general context
 * ("whatWeKnow"), genuine gaps, and client-flagged open items. Key details
 * (budget, objective, timeline, client contact, scope…) are deliberately NOT
 * here — they live only in the key-attributes record (src/lib/briefAttributes.ts,
 * BriefAttributeValue), so there's one source for each.
 */
export const PositionDocumentExtractionSchema = z.object({
  whatWeKnow: z
    .array(
      z.object({
        topic: z.string().describe("e.g. Concept, Audience, Channel, Brand background"),
        detail: z.string(),
      })
    )
    .describe("Everything the brief clearly states that is NOT one of the key details captured separately, as topic/detail pairs."),
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

/**
 * A stored Position Document version. primaryContactName/Email only exist on
 * versions saved before the client contact moved to key attributes — kept
 * optional so that history still parses; nothing reads them any more.
 */
export const PositionDocumentFieldsSchema = PositionDocumentExtractionSchema.extend({
  primaryContactName: z.string().nullable().optional(),
  primaryContactEmail: z.string().nullable().optional(),
});
export type PositionDocumentFields = z.infer<typeof PositionDocumentFieldsSchema>;
export type PositionDocumentExtraction = z.infer<typeof PositionDocumentExtractionSchema>;

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
  positionDocument: PositionDocumentExtraction;
  clarificationEmail: ClarificationEmail;
  checklist: SetupChecklist;
  /** Key details read from the brief (stored as suggestions), or null if that step failed. */
  keyAttributes: KeyAttributeExtraction | null;
  /** Why key-detail extraction failed — recorded on the project, never blocks intake. */
  keyAttributesError: string | null;
}
