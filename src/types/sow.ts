import * as z from "zod";

const SowServiceEntrySchema = z.object({
  involvement: z
    .string()
    .describe(
      "What this capability will deliver/contribute under this SOW, in client-facing language, grounded only in the source documents. Write 'Not included in this engagement' if there is no involvement — never omit the row."
    ),
});

/**
 * Agent-authored narrative content, validated via zodOutputFormat — see
 * sow-agent.ts. Deliberately does NOT include client name, job code, dates,
 * or commercial figures: those are assembled deterministically as
 * SowCoverDetails below, the same "never produced by an agent" discipline
 * EstimateDocumentContentSchema.overview already enforces for the same
 * reason — an LLM asked to reproduce a fact like a job code has a real
 * chance to misstate it, a risk not worth taking on a document that may
 * reach a client.
 */
export const SOWDocumentContentSchema = z.object({
  scopeSummary: z.object({
    objectives: z.array(z.string()).describe("What this engagement is trying to achieve."),
    background: z
      .string()
      .describe(
        "1-2 paragraph narrative summary of why this project is happening — grounded in the brief, not generic boilerplate."
      ),
  }),
  deliverables: z.array(z.string()),
  // Reuses DeliverablesServicesDocument's exact 6-key shape verbatim — never
  // remap onto the 12-value Capability enum used elsewhere in this app.
  // They're different taxonomies; forcing a remap would ask the agent to
  // perform a translation with no ground truth, a real hallucination risk.
  services: z.object({
    experienceCreative: SowServiceEntrySchema,
    business: SowServiceEntrySchema,
    architecture: SowServiceEntrySchema,
    techAndData: SowServiceEntrySchema,
    orchestration: SowServiceEntrySchema,
    other: SowServiceEntrySchema.extend({
      label: z.string().describe("Free-text label for this row, e.g. 'Legal & Compliance'. Use 'Other' if nothing specific applies."),
    }),
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
  assumptions: z.array(z.string()),
  outOfScope: z
    .array(z.string())
    .describe(
      "Explicitly synthesized, not copied from any single upstream field — this app has no dedicated 'out of scope' field. Derive from what is deliberately absent among the deliverables/services, from flagged gaps, and from risks that imply a boundary. Every item must trace back to something in the source context; never invent a boundary the source material doesn't imply."
    ),
  risks: z
    .array(z.string())
    .describe(
      "Restates the source documents' own open questions/risks/flagged gaps in client-appropriate language — never adds a risk that isn't implied by the source material."
    ),
});
export type SOWDocumentContent = z.infer<typeof SOWDocumentContentSchema>;

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
  body: SOWDocumentContent;
}
