import type { PrismaClient } from "@/generated/prisma/client";
import type { Capability } from "@/generated/prisma/enums";

/**
 * Test helpers for estimates: one rate card per estimate, versions created
 * directly (pricing isn't under test here). Estimates must be deleted before
 * a test hub is — EstimateVersion.rateCardVersionId is onDelete: Restrict.
 */
export async function createEstimate(
  prisma: PrismaClient,
  { projectId, clientId, label }: { projectId: string; clientId: string; label: string }
): Promise<{ estimateId: string; rateCardVersionId: string }> {
  const rateCard = await prisma.rateCard.create({ data: { clientId, name: `${label} rates` } });
  const rateCardVersion = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionNumber: 1,
      fileName: "rates.xlsx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "irrelevant",
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  const estimate = await prisma.estimate.create({
    data: { projectId, label, rateCardVersionId: rateCardVersion.id },
  });
  return { estimateId: estimate.id, rateCardVersionId: rateCardVersion.id };
}

export async function addEstimateVersion(
  prisma: PrismaClient,
  {
    estimateId,
    rateCardVersionId,
    versionNumber,
    total,
    currency = "USD",
    capabilities = ["TECH_AND_DATA"],
    createdAt,
  }: {
    estimateId: string;
    rateCardVersionId: string;
    versionNumber: number;
    total: number;
    currency?: string;
    capabilities?: Capability[];
    createdAt?: Date;
  }
): Promise<string> {
  const version = await prisma.estimateVersion.create({
    data: {
      estimateId,
      versionNumber,
      rateCardVersionId,
      capabilitiesIncluded: capabilities,
      totalValue: total,
      currency,
      description: `${capabilities.length} capabilities`,
      fileName: `estimate-v${versionNumber}.docx`,
      fileBytes: Buffer.from("dummy"),
      content: {},
      ...(createdAt ? { createdAt } : {}),
    },
  });
  return version.id;
}
