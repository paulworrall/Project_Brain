import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Integration test for the end-of-Phase-1 "Capabilities & Estimate Brief"
// feature — real Server Actions against the real dev database, only
// Anthropic/revalidatePath/auth mocked, matching stage-1-5-happy-path.test.ts's
// convention. Explicitly covers: confirmed capabilities are a full-replace
// source of truth (not a diff), suggestions never write to the database on
// their own, and each brief generation adds a new version — snapshotting
// which capabilities were included — rather than overwriting.

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

const {
  suggestCapabilitiesAction,
  updateConfirmedCapabilitiesAction,
  generateEstimateBriefAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_CapabilitiesEstimateBriefSpec";

let hubId: string;
let projectId: string;

function capabilitiesFormData(capabilities: string[]) {
  const formData = new FormData();
  for (const capability of capabilities) {
    formData.append("capabilities", capability);
  }
  return formData;
}

const estimateBriefContent = {
  projectOverview: {
    context: "A campaign refresh for a coffee client.",
    whatIsKnown: ["Objective: refresh the campaign"],
    timeline: "Q4 2026",
    constraints: ["UK market only"],
  },
  capabilitySections: [
    { capability: "TECH_AND_DATA" as const, whatIsExpected: ["Confirm CRM integration effort"] },
  ],
};

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({
    data: { name: "CapabilitiesEstimateBriefSpecClient", hubId },
  });
  const workstream = await prisma.workstream.create({
    data: { name: "CapabilitiesEstimateBriefSpecWorkstream", clientId: client.id },
  });
  const project = await prisma.project.create({
    data: { name: "Capabilities Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("updateConfirmedCapabilitiesAction", () => {
  it("saves the checked set, then fully replaces it on the next save (not a diff/patch)", async () => {
    await updateConfirmedCapabilitiesAction(
      projectId,
      undefined,
      capabilitiesFormData(["TECH_AND_DATA", "EXPERIENCE_DESIGN"])
    );

    let saved = await prisma.projectCapability.findMany({ where: { projectId } });
    expect(saved.map((c) => c.capability).sort()).toEqual(["EXPERIENCE_DESIGN", "TECH_AND_DATA"]);

    // Unchecking EXPERIENCE_DESIGN and adding MARKETING_OPERATIONS should
    // remove the former, not just add the latter.
    await updateConfirmedCapabilitiesAction(
      projectId,
      undefined,
      capabilitiesFormData(["TECH_AND_DATA", "MARKETING_OPERATIONS"])
    );

    saved = await prisma.projectCapability.findMany({ where: { projectId } });
    expect(saved.map((c) => c.capability).sort()).toEqual(["MARKETING_OPERATIONS", "TECH_AND_DATA"]);
  });

  it("can clear all confirmed capabilities", async () => {
    await updateConfirmedCapabilitiesAction(projectId, undefined, capabilitiesFormData([]));

    const saved = await prisma.projectCapability.findMany({ where: { projectId } });
    expect(saved).toHaveLength(0);
  });
});

describe("suggestCapabilitiesAction", () => {
  it("never writes to the database — suggestions are returned for the PM to accept, not auto-confirmed", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        suggestions: [{ capability: "TECH_AND_DATA", rationale: "Mentions a CRM integration." }],
        isLowConfidence: false,
        lowConfidenceReason: null,
      },
    });

    const result = await suggestCapabilitiesAction(projectId, undefined, new FormData());

    expect(result.suggestions).toEqual([
      { capability: "TECH_AND_DATA", rationale: "Mentions a CRM integration." },
    ]);
    const saved = await prisma.projectCapability.findMany({ where: { projectId } });
    expect(saved).toHaveLength(0);
  });
});

describe("generateEstimateBriefAction", () => {
  it("refuses to generate with zero confirmed capabilities", async () => {
    const result = await generateEstimateBriefAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/confirm at least one capability/i);
  });

  it("generates a real .docx, snapshotting the confirmed capabilities, and adds a new version on each run rather than overwriting", async () => {
    await updateConfirmedCapabilitiesAction(
      projectId,
      undefined,
      capabilitiesFormData(["TECH_AND_DATA"])
    );

    mockParse.mockResolvedValueOnce({ parsed_output: estimateBriefContent });
    await generateEstimateBriefAction(projectId, undefined, new FormData());

    const afterFirst = await prisma.estimateBrief.findUniqueOrThrow({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(afterFirst.versions).toHaveLength(1);
    expect(afterFirst.versions[0].versionNumber).toBe(1);
    expect(afterFirst.versions[0].capabilities).toEqual(["TECH_AND_DATA"]);
    expect(Buffer.from(afterFirst.versions[0].fileBytes).subarray(0, 2).toString("utf-8")).toBe("PK");

    // Confirm a second capability, then regenerate — should snapshot both
    // and add version 2 without touching version 1.
    await updateConfirmedCapabilitiesAction(
      projectId,
      undefined,
      capabilitiesFormData(["TECH_AND_DATA", "EXPERIENCE_DESIGN"])
    );
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        ...estimateBriefContent,
        capabilitySections: [
          ...estimateBriefContent.capabilitySections,
          { capability: "EXPERIENCE_DESIGN", whatIsExpected: ["Estimate the design refresh"] },
        ],
      },
    });
    await generateEstimateBriefAction(projectId, undefined, new FormData());

    const afterSecond = await prisma.estimateBrief.findUniqueOrThrow({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(afterSecond.versions).toHaveLength(2);
    expect(afterSecond.versions[0].capabilities).toEqual(["TECH_AND_DATA"]);
    expect(afterSecond.versions[1].versionNumber).toBe(2);
    expect(afterSecond.versions[1].capabilities.sort()).toEqual(["EXPERIENCE_DESIGN", "TECH_AND_DATA"]);
  });
});
