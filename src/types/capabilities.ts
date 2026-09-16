import * as z from "zod";
import { Capability } from "@/generated/prisma/enums";

export const CapabilityEnum = z.enum(Capability);

export const CapabilitySuggestionSchema = z.object({
  capability: CapabilityEnum,
  rationale: z
    .string()
    .describe(
      "One or two sentences on what in the brief content triggered this match — specific enough that a PM can judge whether to accept it."
    ),
});
export type CapabilitySuggestion = z.infer<typeof CapabilitySuggestionSchema>;

export const CapabilityAssessmentSchema = z.object({
  suggestions: z
    .array(CapabilitySuggestionSchema)
    .describe("Capabilities this project will likely need, drawn only from the fixed 12-item list."),
  isLowConfidence: z
    .boolean()
    .describe(
      "True if the available brief content is thin/vague and these suggestions are more guesswork than grounded matches — surface this to the PM rather than presenting guesses as certain."
    ),
  lowConfidenceReason: z
    .string()
    .nullable()
    .describe("Short reason shown to the PM when isLowConfidence is true, otherwise null."),
});
export type CapabilityAssessment = z.infer<typeof CapabilityAssessmentSchema>;

export const EstimateBriefContentSchema = z.object({
  projectOverview: z.object({
    context: z.string().describe("What this project is and why it's happening."),
    whatIsKnown: z.array(z.string()).describe("Confirmed details relevant to every capability, as short bullet points."),
    timeline: z.string().describe("Known timeline/key dates, or 'Not yet confirmed'."),
    constraints: z.array(z.string()).describe("Constraints or assumptions every capability should be aware of."),
  }),
  capabilitySections: z
    .array(
      z.object({
        capability: CapabilityEnum,
        whatIsExpected: z
          .array(z.string())
          .describe(
            "What this specific capability needs to know or do to produce an estimate — specific to their discipline, not a repeat of the project overview."
          ),
      })
    )
    .describe("One section per confirmed capability, same order as the confirmed list."),
});
export type EstimateBriefContent = z.infer<typeof EstimateBriefContentSchema>;
