import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assembleSowContext } from "@/lib/sow-context";

// Real-DB integration test for the SOW context assembler — same throwaway-Hub
// convention as estimate-build.test.ts. No Anthropic call happens on this
// path at all, so nothing needs mocking here.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowContextSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowContextSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "SowContextSpecWorkstream", clientId },
  });
  workstreamId = workstream.id;
});

afterAll(async () => {
  // Estimate/EstimateVersion.rateCardVersionId is deliberately onDelete:
  // Restrict — Estimates must be cleared before the Hub cascade reaches
  // RateCardVersion, or Postgres refuses the delete.
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("assembleSowContext", () => {
  it("pulls every document type, confirmed capabilities, and the latest saved estimate when they exist", async () => {
    const project = await prisma.project.create({
      data: {
        name: "Full Context Project",
        workstreamId,
        briefRawText: "A loyalty app refresh for a coffee client.",
        jobCode: "COF-2026-001",
        kickOffDate: new Date("2026-10-01"),
        targetCompletionDate: new Date("2027-03-31"),
      },
    });

    const positionDoc = await prisma.document.create({
      data: { projectId: project.id, type: "POSITION_DOCUMENT" },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: positionDoc.id,
        versionNumber: 1,
        stageNumber: 1,
        content: {
          primaryContactName: "Jamie Chen",
          primaryContactEmail: "jamie@example.com",
          whatWeKnow: [],
          whatWeNeedToFindOut: [],
          clientFlaggedOpenItems: [],
        },
      },
    });

    const draftScopeDoc = await prisma.document.create({
      data: { projectId: project.id, type: "DRAFT_SCOPE_DOCUMENT" },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: draftScopeDoc.id,
        versionNumber: 1,
        stageNumber: 4,
        content: { objectives: ["Deliver a refreshed loyalty app"] },
      },
    });

    const deliverablesDoc = await prisma.document.create({
      data: { projectId: project.id, type: "DELIVERABLES_SERVICES_DOCUMENT" },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: deliverablesDoc.id,
        versionNumber: 1,
        stageNumber: 5,
        content: { openQuestionsRisks: ["Target audience still unknown"] },
      },
    });

    await prisma.projectCapability.create({
      data: { projectId: project.id, capability: "TECH_AND_DATA" },
    });

    const rateCard = await prisma.rateCard.create({ data: { clientId, name: "Context Spec Rates" } });
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
      data: { projectId: project.id, label: "Context Spec Estimate", rateCardVersionId: rateCardVersion.id },
    });
    await prisma.estimateVersion.create({
      data: {
        estimateId: estimate.id,
        versionNumber: 1,
        rateCardVersionId: rateCardVersion.id,
        capabilitiesIncluded: ["TECH_AND_DATA"],
        totalValue: 5700,
        currency: "GBP",
        description: "1 capability: TAD",
        fileName: "estimate.docx",
        fileBytes: Buffer.from("dummy"),
        content: {},
      },
    });

    const { narrativeContext, coverDetails } = await assembleSowContext(project.id);

    expect(narrativeContext).toContain("A loyalty app refresh for a coffee client.");
    expect(narrativeContext).toContain("Position Document");
    expect(narrativeContext).toContain("Draft Scope Document");
    expect(narrativeContext).toContain("Deliverables & Services Document");
    expect(narrativeContext).toContain("Tech & Data");
    expect(narrativeContext).toContain("5700 GBP");

    expect(coverDetails.projectName).toBe("Full Context Project");
    expect(coverDetails.clientName).toBe("SowContextSpecClient");
    expect(coverDetails.jobCode).toBe("COF-2026-001");
    expect(coverDetails.kickOffDate).toBe("1 October 2026");
    expect(coverDetails.targetCompletionDate).toBe("31 March 2027");
    expect(coverDetails.primaryClientContactName).toBe("Jamie Chen");
    expect(coverDetails.primaryClientContactEmail).toBe("jamie@example.com");
    expect(coverDetails.commercials).toEqual({
      totalValue: 5700,
      currency: "GBP",
      description: "1 capability: TAD",
      needsRecalculation: false,
    });
  });

  it("degrades gracefully when no documents, capabilities, or estimate exist yet", async () => {
    const project = await prisma.project.create({
      data: { name: "Empty Context Project", workstreamId },
    });

    const { narrativeContext, coverDetails } = await assembleSowContext(project.id);

    expect(narrativeContext).toContain("No estimate has been saved for this project yet.");
    expect(narrativeContext).not.toContain("Position Document");
    expect(coverDetails.jobCode).toBeNull();
    expect(coverDetails.kickOffDate).toBeNull();
    expect(coverDetails.targetCompletionDate).toBeNull();
    expect(coverDetails.primaryClientContactName).toBeNull();
    expect(coverDetails.primaryClientContactEmail).toBeNull();
    expect(coverDetails.commercials).toBeNull();
  });

  it("never invents a client contact — only ever attributes it from the Position Document", async () => {
    const project = await prisma.project.create({
      data: { name: "No Position Doc Project", workstreamId },
    });

    // A Draft Scope Document exists, but no Position Document — contact
    // details must stay null, not be pulled from anywhere else.
    const draftScopeDoc = await prisma.document.create({
      data: { projectId: project.id, type: "DRAFT_SCOPE_DOCUMENT" },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: draftScopeDoc.id,
        versionNumber: 1,
        stageNumber: 4,
        content: { objectives: ["Something"] },
      },
    });

    const { coverDetails } = await assembleSowContext(project.id);

    expect(coverDetails.primaryClientContactName).toBeNull();
    expect(coverDetails.primaryClientContactEmail).toBeNull();
  });
});
