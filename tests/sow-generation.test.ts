import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Integration test for "Generate SOW" — real Server Actions against the real
// dev database, only Anthropic/revalidatePath/auth mocked, matching
// capabilities-and-estimate-brief.test.ts's convention. Explicitly covers
// the non-destructive versioning requirement: regenerating always appends a
// new SOWVersion, and each version's snapshotted template stays tied to
// whatever was selected at generation time even after the live selection
// changes.

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

const { startSowDevelopmentAction, generateSowAction } = await import(
  "@/app/(dashboard)/projects/[projectId]/actions"
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowGenerationSpec";

let hubId: string;
let clientId: string;
let projectId: string;
let templateAId: string;
let templateAVersionId: string;
let templateBId: string;
let templateBVersionId: string;

const sowContent = {
  scopeSummary: { objectives: ["Deliver a refreshed loyalty app"], background: "Background text." },
  deliverables: ["Points-based rewards system"],
  services: {
    experienceCreative: { involvement: "Not included in this engagement" },
    business: { involvement: "Not included in this engagement" },
    architecture: { involvement: "Not included in this engagement" },
    techAndData: { involvement: "Build the integration" },
    orchestration: { involvement: "Not included in this engagement" },
    other: { involvement: "Not included in this engagement", label: "Other" },
  },
  milestones: [],
  rolesAndResponsibilities: [],
  assumptions: [],
  outOfScope: [],
  risks: [],
};

function selectTemplateFormData(sowTemplateId: string, sowTemplateVersionId: string) {
  const formData = new FormData();
  formData.set("sowTemplateId", sowTemplateId);
  formData.set("sowTemplateVersionId", sowTemplateVersionId);
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowGenerationSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "SowGenerationSpecWorkstream", clientId },
  });
  const project = await prisma.project.create({
    data: { name: "SOW Generation Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;

  const templateA = await prisma.sOWTemplate.create({
    data: { name: "Template A", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
  });
  templateAId = templateA.id;
  const templateAVersion = await prisma.sOWTemplateVersion.create({
    data: {
      sowTemplateId: templateA.id,
      versionNumber: 1,
      fileName: "template-a.docx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "Template A structure: Overview, Scope, Fees.",
    },
  });
  templateAVersionId = templateAVersion.id;

  const templateB = await prisma.sOWTemplate.create({
    data: { name: "Template B", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
  });
  templateBId = templateB.id;
  const templateBVersion = await prisma.sOWTemplateVersion.create({
    data: {
      sowTemplateId: templateB.id,
      versionNumber: 1,
      fileName: "template-b.docx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "Template B structure: Background, Deliverables, Terms.",
    },
  });
  templateBVersionId = templateBVersion.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("generateSowAction", () => {
  it("refuses to generate before a template is selected", async () => {
    const result = await generateSowAction(projectId, undefined, new FormData());
    expect(result?.message).toMatch(/select a sow template/i);
  });

  it("generates v1, then regenerating appends v2 rather than overwriting, and each version keeps the template it was actually generated against", async () => {
    await startSowDevelopmentAction(projectId, undefined, selectTemplateFormData(templateAId, templateAVersionId));

    mockParse.mockResolvedValueOnce({ parsed_output: sowContent });
    const firstResult = await generateSowAction(projectId, undefined, new FormData());
    expect(firstResult?.message).toBeUndefined();

    const firstExtractionCall = mockParse.mock.calls[0][0];
    expect(firstExtractionCall.messages[0].content).toContain("Template A structure");

    const sow = await prisma.sOW.findUniqueOrThrow({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(sow.versions).toHaveLength(1);
    expect(sow.versions[0].versionNumber).toBe(1);
    expect(sow.versions[0].sowTemplateVersionId).toBe(templateAVersionId);
    expect(Buffer.from(sow.versions[0].fileBytes).subarray(0, 2).toString("utf-8")).toBe("PK");
    const v1Id = sow.versions[0].id;

    // Change the live template selection before regenerating.
    await startSowDevelopmentAction(projectId, undefined, selectTemplateFormData(templateBId, templateBVersionId));

    mockParse.mockResolvedValueOnce({ parsed_output: sowContent });
    const secondResult = await generateSowAction(projectId, undefined, new FormData());
    expect(secondResult?.message).toBeUndefined();

    const secondExtractionCall = mockParse.mock.calls[mockParse.mock.calls.length - 1][0];
    expect(secondExtractionCall.messages[0].content).toContain("Template B structure");

    const sowAfterSecond = await prisma.sOW.findUniqueOrThrow({
      where: { projectId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(sowAfterSecond.versions).toHaveLength(2);
    expect(sowAfterSecond.versions[1].versionNumber).toBe(2);
    // v2 snapshots the NEW template...
    expect(sowAfterSecond.versions[1].sowTemplateVersionId).toBe(templateBVersionId);
    // ...while v1 still reflects what it was actually generated against, unchanged.
    const v1Reloaded = sowAfterSecond.versions.find((v) => v.id === v1Id)!;
    expect(v1Reloaded.sowTemplateVersionId).toBe(templateAVersionId);
  });
});
