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
 * ("whatWeKnow") and client-flagged open items. Key details (budget,
 * objective, timeline, client contact, scope…) are deliberately NOT here —
 * they live only in the key-attributes record (src/lib/briefAttributes.ts,
 * BriefAttributeValue), so there's one source for each. What still needs
 * finding out is derived from those key details (the "What We Need to Find
 * Out" checklist), not generated.
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
  clientFlaggedOpenItems: z
    .array(z.string())
    .describe(
      "Items the client themselves flagged as undecided (TBC, '???', 'still deciding', etc.) — distinct from genuine gaps."
    ),
});

/**
 * A stored Position Document version. primaryContactName/Email only exist on
 * versions saved before the client contact moved to key attributes, and
 * whatWeNeedToFindOut only on versions saved while that list was still
 * AI-generated — kept optional so that history still parses. Only the
 * version history shows the old questions; nothing else reads them.
 */
export const PositionDocumentFieldsSchema = PositionDocumentExtractionSchema.extend({
  primaryContactName: z.string().nullable().optional(),
  primaryContactEmail: z.string().nullable().optional(),
  whatWeNeedToFindOut: z.array(z.string()).optional(),
});
export type PositionDocumentFields = z.infer<typeof PositionDocumentFieldsSchema>;
export type PositionDocumentExtraction = z.infer<typeof PositionDocumentExtractionSchema>;

export const ClarificationEmailSchema = z.object({
  subject: z.string(),
  bodyText: z
    .string()
    .describe(
      "Plain-text email body. Polite, professional, references the client by name if known. Lists the key details still needed, the key details to confirm, and client-flagged open items in separate, clearly labeled sections."
    ),
});
export type ClarificationEmail = z.infer<typeof ClarificationEmailSchema>;

/** The stored Set-Up Checklist document (DocumentType CHECKLIST): labels only. */
export const SetupChecklistSchema = z.object({
  items: z.array(z.string()),
});
export type SetupChecklist = z.infer<typeof SetupChecklistSchema>;

/**
 * One checklist item as intake creates it (FB-008): its label and the step
 * whose "Before you move on" list it belongs to.
 */
export const SetupChecklistItemSchema = z.object({
  label: z.string(),
  step: z.enum(["brief", "estimate", "sow"]),
});
export type SetupChecklistItem = z.infer<typeof SetupChecklistItemSchema>;

export interface IntakeSetupChecklist {
  items: SetupChecklistItem[];
}

/**
 * The fixed set-up items every new project starts with (not AI-generated).
 * All are early admin tasks, so all belong to the Brief step; PMs can move
 * any of them to another step when editing.
 */
export const DEFAULT_SETUP_CHECKLIST_ITEMS: readonly SetupChecklistItem[] = [
  { label: "Set up Workbook entry", step: "brief" },
  { label: "Create project folder", step: "brief" },
  { label: "Assign job code", step: "brief" },
  { label: "Assign Project Manager", step: "brief" },
  { label: "Create Teams channel", step: "brief" },
];

export interface IntakeAgentResult {
  classification: BriefClassification;
  positionDocument: PositionDocumentExtraction;
  clarificationEmail: ClarificationEmail;
  checklist: IntakeSetupChecklist;
  /** Key details read from the brief (stored as suggestions), or null if that step failed. */
  keyAttributes: KeyAttributeExtraction | null;
  /** Why key-detail extraction failed — recorded on the project, never blocks intake. */
  keyAttributesError: string | null;
}
