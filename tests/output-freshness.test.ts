import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Outputs record the brief version they were built from (kept for audit),
// and are never silently regenerated when the project changes. Staleness is no
// longer computed for any output; the SOW's change notice is tested in
// sow-change-status.test.ts.

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
const { redraftClarificationEmail, rebuildPositionDocumentVersion } = await import("@/lib/outputRegeneration");
const {
  uploadKnowledgeItemAction,
  generateEstimateBriefAction,
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
    await rebuildPositionDocumentVersion(projectId, null);
    mockParse.mockResolvedValueOnce({ parsed_output: { subject: "Redraft", bodyText: "New body" } });
    await redraftClarificationEmail(projectId, null);

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

describe("outputs are never regenerated on their own", () => {
  it("never regenerates the Estimate Brief or SOW on its own when an update arrives", async () => {
    const projectId = await newProject("No Auto Regenerate", false);
    await prepareEstimateBrief(projectId);
    await addUpdate(projectId, "A late change.");

    expect(await prisma.estimateBriefVersion.count({ where: { estimateBrief: { projectId } } })).toBe(1);
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(0);
  });
});
