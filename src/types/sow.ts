import * as z from "zod";

/**
 * Agent-authored narrative, validated via zodOutputFormat — see sow-agent.ts.
 * This is ONLY the prose-like parts of a SOW (scope summary, milestones,
 * roles). The five reviewable lists — deliverables, services, assumptions,
 * out of scope, risks — are NOT agent output any more: a PM validates them
 * first (SowSectionItem) and they are copied into the document verbatim, so
 * composition can't invent or drop one.
 *
 * Deliberately does NOT include client name, job code, dates, or commercial
 * figures: those are assembled deterministically as SowCoverDetails below,
 * the same "never produced by an agent" discipline
 * EstimateDocumentContentSchema.overview already enforces — an LLM asked to
 * reproduce a fact like a job code has a real chance to misstate it, a risk
 * not worth taking on a document that may reach a client.
 */
export const SOWNarrativeSchema = z.object({
  scopeSummary: z.object({
    objectives: z.array(z.string()).describe("What this engagement is trying to achieve."),
    background: z
      .string()
      .describe(
        "1-2 paragraph narrative summary of why this project is happening — grounded in the brief, not generic boilerplate."
      ),
  }),
  milestones: z.array(
    z.object({
      name: z.string(),
      dueDate: z.string().nullable().describe("ISO date or a plain description like 'End of Q3' — null if unknown."),
    })
  ),
  rolesAndResponsibilities: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      organization: z.enum(["AGENCY", "CLIENT"]),
    })
  ),
});
export type SOWNarrative = z.infer<typeof SOWNarrativeSchema>;

/** The five PM-validated lists, in the order they're stored and rendered. */
export interface SOWValidatedLists {
  deliverables: string[];
  services: string[];
  assumptions: string[];
  outOfScope: string[];
  risks: string[];
}

/** A SOW body as composed today: agent narrative + the PM-validated lists. */
export type SOWDocumentContent = SOWNarrative & SOWValidatedLists;

/**
 * Services used to be six fixed capability rows (before the PM review step
 * made it a list). SOW versions generated back then still carry this shape in
 * SOWVersion.content, so the renderer accepts both.
 */
export interface LegacySowServices {
  experienceCreative: { involvement: string };
  business: { involvement: string };
  architecture: { involvement: string };
  techAndData: { involvement: string };
  orchestration: { involvement: string };
  other: { involvement: string; label: string };
}

/**
 * Deterministic — assembled from Prisma rows by generateSowAction /
 * assembleSowContext, never produced or touched by the agent.
 */
export interface SowCoverDetails {
  projectName: string;
  clientName: string;
  jobCode: string | null;
  preparedDate: string;
  kickOffDate: string | null;
  targetCompletionDate: string | null;
  primaryClientContactName: string | null;
  primaryClientContactEmail: string | null;
  // needsRecalculation: the estimate was priced before unit conversion existed — its total may be wrong.
  commercials: { totalValue: number; currency: string; description: string; needsRecalculation?: boolean } | null;
}

/** The full shape stored in SOWVersion.content. */
export interface SOWContent {
  coverDetails: SowCoverDetails;
  body: Omit<SOWDocumentContent, "services"> & { services: string[] | LegacySowServices };
}
