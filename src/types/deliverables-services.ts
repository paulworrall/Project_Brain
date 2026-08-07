import * as z from "zod";

const ServiceEntrySchema = z.object({
  involvement: z
    .string()
    .describe(
      "What this capability needs to contribute to this project, or 'Not required' if none."
    ),
});

export const DeliverablesServicesDocumentSchema = z.object({
  deliverables: z.array(z.string()),
  services: z.object({
    experienceCreative: ServiceEntrySchema,
    business: ServiceEntrySchema,
    architecture: ServiceEntrySchema,
    techAndData: ServiceEntrySchema,
    orchestration: ServiceEntrySchema,
    other: ServiceEntrySchema.extend({
      label: z
        .string()
        .describe(
          "Free-text label for this row, e.g. 'Legal & Compliance'. Use 'Other' if nothing specific applies."
        ),
    }),
  }),
  openQuestionsRisks: z.array(z.string()),
  outstandingGapsCarriedForward: z.array(z.string()),
});
export type DeliverablesServicesDocument = z.infer<typeof DeliverablesServicesDocumentSchema>;

export const SERVICE_ROWS: {
  key: Exclude<keyof DeliverablesServicesDocument["services"], "other">;
  label: string;
}[] = [
  { key: "experienceCreative", label: "Experience/Creative" },
  { key: "business", label: "Business" },
  { key: "architecture", label: "Architecture" },
  { key: "techAndData", label: "Tech and Data" },
  { key: "orchestration", label: "Orchestration" },
];
