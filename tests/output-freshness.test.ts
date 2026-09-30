import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Phase 3: outputs record the brief version they were built from, and are
// flagged stale — never silently regenerated — when the project changes.

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return {
    default: Object.assign(MockAnthropic, { RateLimitError, APIError }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");
const { getOutputFreshness } = await import("@/lib/outputFreshness");
const {
  uploadKnowledgeItemAction,
  generateEstimateBriefAction,
  regenerateClarificationEmailAction,
  regeneratePositionDocumentAction,
  updatePmPerspectiveFieldAction,
  saveBriefAttributeAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_OutputFreshnessSpec";

let hubId: string;
let workstreamId: string;
let clientId: string;

const positionFields = {
  whatWeKnow: [{ topic: "Audience", detail: "Existing loyalty members." }],
  clientFlaggedOpenItems: [] as string[],
};

const estimateBrief = {
  projectOverview: { context: "A relaunch.", whatIsKnown: [], constraints: [] },
  capabilitySections: [{ capability: "TECH_AND_DATA" as const, whatIsExpected: ["Estimate the build"] }],
};

function updateForm(content: string): FormData {
  const formData = new FormData();
  formData.set("content", content);
  return formData;
}

/** Adds an update the way the panel does (refreshing the Position Document if there is one; no key details). */
async function addUpdate(projectId: string, content: string): Promise<void> {
  const hasPositionDocument = await prisma.document.count({
    where: { projectId, type: "POSITION_DOCUMENT" },
  });
  if (hasPositionDocument) mockParse.mockResolvedValueOnce({ parsed_output: positionFields });
  mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
  const result = await uploadKnowledgeItemAction(projectId, undefined, updateForm(content));
  expect(result?.message).toBeUndefined();
}

async function newProject(name: string, withPositionDocument = true): Promise<string> {
  const project = await prisma.project.create({
    data: { name, workstreamId, briefRawText: "Relaunch the loyalty app." },
  });
  if (withPositionDocument) {
    await prisma.document.create({
      data: {
        projectId: project.id,
        type: "POSITION_DOCUMENT",
        versions: {
          create: { versionNumber: 1, stageNumber: 1, content: positionFields, builtFromVersion: 1 },
        },
      },
    });
  }
  await prisma.projectCapability.create({ data: { projectId: project.id, capability: "TECH_AND_DATA" } });
  return project.id;
}

async function prepareEstimateBrief(projectId: string): Promise<void> {
  mockParse.mockResolvedValueOnce({ parsed_output: estimateBrief });
  const result = await generateEstimateBriefAction(projectId, undefined, new FormData());
  expect(result?.message).toBeUndefined();
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "FreshnessSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "FreshnessSpecWorkstream", clientId: client.id },
  });
  workstreamId = workstream.id;
});

afterAll(async () => {
  // EstimateVersion.rateCardVersionId is onDelete: Restrict — clear estimates
  // before the Hub cascade reaches RateCardVersion (as sow-context.test.ts does).
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("outputs record the brief version they were built from", () => {
  it("the Estimate Brief records the latest version at the time", async () => {
    const projectId = await newProject("Records Estimate Brief", false);
    await addUpdate(projectId, "First update.");
    await addUpdate(projectId, "Second update.");

    await prepareEstimateBrief(projectId);

    const version = await prisma.estimateBriefVersion.findFirstOrThrow({
      where: { estimateBrief: { projectId } },
    });
    expect(version.builtFromVersion).toBe(3);
  });

  it("a Position Document refreshed by an update records that update's version", async () => {
    const projectId = await newProject("Records Position Document");
    mockParse.mockResolvedValueOnce({ parsed_output: positionFields }); // refresh
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() }); // key details
    await uploadKnowledgeItemAction(projectId, undefined, updateForm("An update."));

    const latest = await prisma.documentVersion.findFirstOrThrow({
      where: { document: { projectId, type: "POSITION_DOCUMENT" } },
      orderBy: { versionNumber: "desc" },
    });
    expect(latest.versionNumber).toBe(2);
    expect(latest.builtFromVersion).toBe(2);
  });

  it("a regenerated Position Document or email is a new version built from the latest — earlier versions untouched", async () => {
    const projectId = await newProject("Regenerates");
    await prisma.document.create({
      data: {
        projectId,
        type: "CLARIFICATION_EMAIL",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: { subject: "Original", bodyText: "Original body" },
            builtFromVersion: 1,
          },
        },
      },
    });
    await addUpdate(projectId, "Budget is now £120k.");

    mockParse.mockResolvedValueOnce({ parsed_output: positionFields }); // rebuild
    await regeneratePositionDocumentAction(projectId, undefined, new FormData());
    mockParse.mockResolvedValueOnce({ parsed_output: { subject: "Redraft", bodyText: "New body" } });
    await regenerateClarificationEmailAction(projectId, undefined, new FormData());

    const versions = await prisma.documentVersion.findMany({
      where: { document: { projectId } },
      include: { document: { select: { type: true } } },
      orderBy: { versionNumber: "asc" },
    });
    const of = (type: string) => versions.filter((v) => v.document.type === type);
    // v2 is the update's own refresh; v3 the rebuild from the full context.
    expect(of("POSITION_DOCUMENT").map((v) => [v.versionNumber, v.builtFromVersion])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
    expect(of("CLARIFICATION_EMAIL").map((v) => [v.versionNumber, v.builtFromVersion])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(of("CLARIFICATION_EMAIL")[0].content).toEqual({ subject: "Original", bodyText: "Original body" });
  });
});

describe("stale outputs", () => {
  it("a new update marks the Estimate Brief stale, and regenerating clears it", async () => {
    const projectId = await newProject("Stale After Update", false);
    await prepareEstimateBrief(projectId);
    expect((await getOutputFreshness(projectId)).estimateBrief?.stale).toBe(false);

    await addUpdate(projectId, "The client added a new market.");

    const stale = (await getOutputFreshness(projectId)).estimateBrief!;
    expect(stale).toMatchObject({ stale: true, builtFromVersion: 1, latestVersion: 2, canRegenerate: true });
    expect(stale.reasons).toEqual(["New update: v2"]);

    await prepareEstimateBrief(projectId);
    expect((await getOutputFreshness(projectId)).estimateBrief?.stale).toBe(false);
  });

  it("a PM perspective edit marks outputs stale", async () => {
    const projectId = await newProject("Stale After PM Edit");
    await prepareEstimateBrief(projectId);
    const form = new FormData();
    form.set("content", "We know this client well.");
    await updatePmPerspectiveFieldAction(projectId, "initialThoughts", undefined, form);

    const freshness = await getOutputFreshness(projectId);
    expect(freshness.estimateBrief?.reasons).toEqual(["PM perspective edited"]);
    expect(freshness.positionDocument?.stale).toBe(true);
  });

  it("a key detail change marks outputs stale", async () => {
    const projectId = await newProject("Stale After Key Detail");
    await prepareEstimateBrief(projectId);
    const form = new FormData();
    form.set("amount", "£150k");
    await saveBriefAttributeAction(projectId, "budget", undefined, form);

    expect((await getOutputFreshness(projectId)).estimateBrief?.reasons).toEqual(["Key details changed"]);
  });

  it("a Position Document isn't stale from the key details its own update brought", async () => {
    const projectId = await newProject("Own Key Details");
    mockParse.mockResolvedValueOnce({ parsed_output: positionFields });
    mockParse.mockResolvedValueOnce({
      parsed_output: keyAttributeFacts({ budget: { amount: "£95k", evidence: "Budget £95k." } }),
    });
    mockParse.mockResolvedValueOnce({ parsed_output: { coveredIndexes: [] } });
    await uploadKnowledgeItemAction(projectId, undefined, updateForm("Budget £95k."));

    expect((await getOutputFreshness(projectId)).positionDocument?.stale).toBe(false);
  });
});

describe("estimates and specialist review are flagged, never regenerated", () => {
  it("flags an estimate and the Deliverables + Services document after an update, and changes neither", async () => {
    const projectId = await newProject("Flag Only");
    const rateCard = await prisma.rateCard.create({ data: { clientId, name: "Flag Only Rates" } });
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
      data: { projectId, label: "Main estimate", rateCardVersionId: rateCardVersion.id },
    });
    await prisma.estimateVersion.create({
      data: {
        estimateId: estimate.id,
        versionNumber: 1,
        rateCardVersionId: rateCardVersion.id,
        capabilitiesIncluded: ["TECH_AND_DATA"],
        totalValue: 5700,
        currency: "GBP",
        description: "1 capability",
        fileName: "estimate.docx",
        fileBytes: Buffer.from("dummy"),
        content: {},
      },
    });
    await prisma.document.create({
      data: {
        projectId,
        type: "DELIVERABLES_SERVICES_DOCUMENT",
        versions: { create: { versionNumber: 1, stageNumber: 5, content: { deliverables: [] } } },
      },
    });

    await addUpdate(projectId, "Scope reduced to one market.");

    const freshness = await getOutputFreshness(projectId);
    expect(freshness.estimates[estimate.id]).toMatchObject({ stale: true, canRegenerate: false });
    expect(freshness.deliverablesServices).toMatchObject({ stale: true, canRegenerate: false });
    // Only the update's own steps ran (Position Document refresh, key-detail
    // read) — nothing was regenerated.
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(await prisma.estimateVersion.count({ where: { estimateId: estimate.id } })).toBe(1);
    expect(
      await prisma.documentVersion.count({
        where: { document: { projectId, type: "DELIVERABLES_SERVICES_DOCUMENT" } },
      })
    ).toBe(1);
  });

  it("never regenerates the Estimate Brief or SOW on its own when an update arrives", async () => {
    const projectId = await newProject("No Auto Regenerate", false);
    await prepareEstimateBrief(projectId);
    await addUpdate(projectId, "A late change.");

    expect(await prisma.estimateBriefVersion.count({ where: { estimateBrief: { projectId } } })).toBe(1);
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(0);
  });
});
