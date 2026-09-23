import * as z from "zod";
import { RateType, RoleMatchType } from "@/generated/prisma/enums";
import { CapabilityEnum } from "@/types/capabilities";

export const RateTypeEnum = z.enum(RateType);
export const RoleMatchTypeEnum = z.enum(RoleMatchType);

/**
 * One structured rate-card line, extracted by rate-card-line-item-agent.ts
 * from a RateCardVersion's already-stored extractedText. Cached to
 * RateCardLineItem after extraction — never re-parsed for that version.
 */
export const RateCardLineItemExtractionSchema = z.object({
  role: z
    .string()
    .describe("The role/title exactly as it appears on the rate card, e.g. 'Developer'."),
  level: z
    .string()
    .nullable()
    .describe(
      "The seniority/level if the rate card states one, e.g. 'Senior' — null if the card has no level distinction for this role."
    ),
  rateType: RateTypeEnum.describe("Whether the rate is hourly, daily, or weekly."),
  rate: z.number().describe("The numeric rate amount, e.g. 425.50."),
  currency: z.string().describe("The 3-letter currency code, e.g. 'GBP', 'USD'."),
});
export const RateCardLineItemExtractionListSchema = z.array(RateCardLineItemExtractionSchema);
export type RateCardLineItemExtraction = z.infer<typeof RateCardLineItemExtractionSchema>;

/**
 * One role extracted from a capability team's raw estimate text, by
 * estimate-role-extraction-agent.ts — before any matching against the rate
 * card happens.
 */
export const ExtractedRoleLineSchema = z.object({
  rawRoleText: z
    .string()
    .describe("The role text as it literally appeared in the input, unmodified."),
  extractedRole: z.string().describe("The normalized role/title, e.g. 'Developer'."),
  extractedLevel: z
    .string()
    .nullable()
    .describe(
      "The seniority/level if stated or clearly implied by the input — null if genuinely not indicated. Never guess a level that wasn't stated."
    ),
  extractedCapability: CapabilityEnum.describe(
    "Which ONE of the 12 fixed MAP capability teams this specific role most likely belongs to, based on what the role actually does — reason about the work, don't keyword-match. Always pick exactly one from the fixed list, even if the source text doesn't name a team explicitly. Never invent a value outside the fixed list, and never split one role across two capabilities."
  ),
  quantity: z
    .number()
    .describe(
      "The numeric quantity exactly as stated, in whatever unit the input used — never converted."
    ),
  // A nullable string, not z.enum: the SDK's structured-output transform
  // doesn't enforce enums, so an off-list value would fail validation and
  // sink the whole extraction. The caller maps this with parseEstimateUnit(),
  // where anything not clearly hours/days/weeks becomes null = PM review.
  unit: z
    .string()
    .nullable()
    .describe(
      "The unit the input actually used for this quantity — exactly one of 'hours', 'days' or 'weeks' (person-days = days, etc.). null if no unit is stated, it's ambiguous, or it's anything else (months, sprints, FTE, %). Never assume hours — a missing unit is flagged for a human to confirm."
    ),
  rawUnitText: z
    .string()
    .nullable()
    .describe(
      "The unit word exactly as it appeared in the input (e.g. 'person days', 'hrs', 'months'), or null if none was written."
    ),
});
export const ExtractedRoleLineListSchema = z.array(ExtractedRoleLineSchema);
export type ExtractedRoleLine = z.infer<typeof ExtractedRoleLineSchema>;

/**
 * The role-matching agent's raw judgment for one extracted role against the
 * estimate's locked rate card — NOT a final resolution. Whether this counts
 * as auto-resolved is decided separately and conservatively by
 * src/lib/estimateMatching.ts, never by the agent itself.
 */
export const RoleMatchResultSchema = z.object({
  rawRoleText: z
    .string()
    .describe("Must match one of the input roles' rawRoleText exactly, to pair results back up."),
  matchType: RoleMatchTypeEnum.describe(
    "NO_MATCH if nothing on the rate card resembles this role. ROLE_ONLY if the role matches but the level is missing, ambiguous, or the rate card has multiple levels for this role and none was specified. ROLE_AND_LEVEL only if both the role AND a specific level are confidently identified and match exactly one rate-card line."
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0-1 confidence in this specific judgment, calibrated — not inflated to seem helpful."
    ),
  suggestedRateCardLineId: z
    .string()
    .nullable()
    .describe(
      "The id of the best-candidate rate card line, as a starting point for PM confirmation — null if matchType is NO_MATCH. Never presented as an accepted match; the PM always confirms or overrides it."
    ),
});
export const RoleMatchResultListSchema = z.array(RoleMatchResultSchema);
export type RoleMatchResult = z.infer<typeof RoleMatchResultSchema>;

/**
 * Structured content behind the generated estimate .docx (see
 * estimate-document-docx.ts) — built entirely from already-resolved,
 * already-priced data in saveEstimateVersionAction. Never produced by an
 * agent: the overview fields and line items are plain data, and totals are
 * always computed by estimate-pricing.ts.
 */
export const EstimateDocumentLineItemSchema = z.object({
  role: z.string(),
  level: z.string().nullable(),
  rateType: RateTypeEnum,
  rate: z.number(),
  quantity: z.number(),
  // An EstimateUnit ("DAYS") on new content; free text ("days",
  // "unspecified") on content saved before unit conversion existed.
  unit: z.string(),
  // quantity in hours — absent on legacy content.
  hours: z.number().nullable().optional(),
  feeSubtotal: z.number(),
  // Traces this line back to its source RoleResolution/RateCardLineItem —
  // needed by the review grid's inline "Update quantity" control. Not used
  // by document rendering (docx/xlsx) itself.
  roleResolutionId: z.string(),
  rateCardLineItemId: z.string(),
});

export const EstimateDocumentContentSchema = z.object({
  overview: z.object({
    clientName: z.string(),
    projectName: z.string(),
    projectCode: z.string().nullable(),
    generatedDate: z.string(),
    rateCardName: z.string(),
    rateCardVersionNumber: z.number(),
  }),
  capabilitySections: z.array(
    z.object({
      capability: CapabilityEnum,
      lineItems: z.array(EstimateDocumentLineItemSchema),
      subtotal: z.number(),
    })
  ),
  currency: z.string(),
  totalValue: z.number(),
  // The conversion factors this content was priced at — absent on legacy
  // content (see EstimateVersion.needsRecalculation).
  hoursPerDay: z.number().optional(),
  daysPerWeek: z.number().optional(),
});
export type EstimateDocumentContent = z.infer<typeof EstimateDocumentContentSchema>;
