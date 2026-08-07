import * as z from "zod";

export const DraftScopeDocumentSchema = z.object({
  objectives: z.array(z.string()).describe("What this project is trying to achieve."),
  deliverables: z.array(z.string()),
  milestones: z.array(
    z.object({
      name: z.string(),
      dueDate: z
        .string()
        .nullable()
        .describe("ISO date or a plain description like 'End of Q3' — null if unknown."),
    })
  ),
  rolesAndResponsibilities: z.object({
    contacts: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        organization: z.enum(["AGENCY", "CLIENT"]),
      })
    ),
    capabilities: z
      .array(z.string())
      .describe("Specialist capabilities this project is expected to need."),
  }),
  budget: z.object({
    summary: z.string().describe("What's known about budget, or 'Not yet confirmed'."),
    isConfirmed: z.boolean(),
  }),
  assumptionsAndConstraints: z.array(z.string()),
  flaggedGaps: z
    .array(z.string())
    .describe(
      "Remaining open items or unresolved gaps specialists should know about before scoping their input. Never block on these — always produce a complete draft regardless."
    ),
});
export type DraftScopeDocument = z.infer<typeof DraftScopeDocumentSchema>;
