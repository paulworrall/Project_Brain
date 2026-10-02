import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// SOW ↔ estimate sync, Phase 3: "Update SOW" makes a NEW SOW version from the
// pinned estimate's current version. The estimate-derived section (the
// commercials) is refreshed; the authored narrative is carried forward
// unchanged — no AI call, so nothing in the scope can shift.

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
const { startSowDevelopmentAction, generateSowAction, updateSowFromEstimateAction } = await import(
  "@/app/(dashboard)/projects/[projectId]/actions"
);
const { getSowSyncStatus } = await import("@/lib/sowSync");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowUpdateSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;
let templateId: string;
let templateVersionId: string;

const sowBody = {
  scopeSummary: { objectives: ["AUTHORED_OBJECTIVE"], background: "AUTHORED_BACKGROUND" },
  deliverables: ["A relaunched app"],
  services: {
    experienceCreative: { involvement: "Not included in this engagement" },
    business: { involvement: "Not included in this engagement" },
    architecture: { involvement: "Not included in this engagement" },
    techAndData: { involvement: "Build it" },
    orchestration: { involvement: "Not included in this engagement" },
    other: { involvement: "Not included in this engagement", label: "Other" },
  },
  milestones: [],
  rolesAndResponsibilities: [],
  assumptions: ["AUTHORED_ASSUMPTION"],
  outOfScope: ["AUTHORED_EXCLUSION"],
  risks: [],
};

/** A project with a SOW v1 generated from Estimate v1 (50,400 USD). */
async function projectWithSow(name: string) {
  const project = await prisma.project.create({ data: { name, workstreamId } });
  await prisma.briefAttributeValue.createMany({
    data: [
      { attributeId: "budget", values: { amount: "$90k" } },
      { attributeId: "objective", values: { objective: "Relaunch", successMeasures: "More actives" } },
      { attributeId: "timeline", values: { startDate: "2026-10-01" } },
      { attributeId: "clientContact", values: { name: "Caroline", email: "caroline@fizzy.example" } },
    ].map((row) => ({ ...row, projectId: project.id, kind: "CONFIRMED" as const, source: "PM_ENTRY" as const })),
  });
  const form = new FormData();
  form.set("sowTemplateId", templateId);
  form.set("sowTemplateVersionId", templateVersionId);
  await startSowDevelopmentAction(project.id, undefined, form);
  const estimate = await createEstimate(prisma, { projectId: project.id, clientId, label: "Main" });
  const v1 = await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 50400 });
  mockParse.mockResolvedValueOnce({ parsed_output: sowBody });
  expect((await generateSowAction(project.id, undefined, new FormData()))?.message).toBeUndefined();
  const sowV1 = await prisma.sOWVersion.findFirstOrThrow({ where: { sow: { projectId: project.id } } });
  return { projectId: project.id, estimate, v1, sowV1 };
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowUpdateSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({ data: { name: "SowUpdateSpecWorkstream", clientId } });
  workstreamId = workstream.id;
  const template = await prisma.sOWTemplate.create({
    data: { name: "Update Spec Template", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
  });
  templateId = template.id;
  const templateVersion = await prisma.sOWTemplateVersion.create({
    data: {
      sowTemplateId: template.id,
      versionNumber: 1,
      fileName: "template.docx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "Overview, Scope, Fees.",
    },
  });
  templateVersionId = templateVersion.id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("updateSowFromEstimateAction", () => {
  it("creates a new SOW version from the estimate's current version — refreshing the fees, keeping the authored narrative, old version retained", async () => {
    const { projectId, estimate, sowV1 } = await projectWithSow("Updates SOW");
    const v3 = await addEstimateVersion(prisma, {
      ...estimate,
      versionNumber: 3,
      total: 93000,
      capabilities: ["TECH_AND_DATA", "TECH_SOLUTION_CONSULTING"],
    });
    expect((await getSowSyncStatus(projectId)).sow?.status).toBe("stale");
    mockParse.mockReset();

    const result = await updateSowFromEstimateAction(projectId, sowV1.id, undefined, new FormData());

    expect(result?.message).toBeUndefined();
    expect(mockParse).not.toHaveBeenCalled();
    const versions = await prisma.sOWVersion.findMany({
      where: { sow: { projectId } },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]).toEqual(sowV1);

    const updated = versions[1];
    expect(updated.versionNumber).toBe(2);
    expect(updated.sourceEstimateVersionId).toBe(v3);
    expect(Number(updated.sourceEstimateTotal)).toBe(93000);
    expect(updated.sourceEstimateCapabilities).toEqual(["TECH_AND_DATA", "TECH_SOLUTION_CONSULTING"]);
    expect(updated.sowTemplateVersionId).toBe(sowV1.sowTemplateVersionId);
    expect(updated.fileName).toMatch(/v2\.docx$/);
    expect(Buffer.from(updated.fileBytes).subarray(0, 2).toString("utf-8")).toBe("PK");

    const before = sowV1.content as { body: unknown; coverDetails: { commercials: { totalValue: number } } };
    const after = updated.content as typeof before;
    expect(after.body).toEqual(before.body);
    expect(before.coverDetails.commercials.totalValue).toBe(50400);
    expect(after.coverDetails.commercials).toMatchObject({ totalValue: 93000, currency: "USD" });

    const sync = await getSowSyncStatus(projectId);
    expect(sync.sow).toMatchObject({ status: "in_sync", sowVersionNumber: 2 });
    expect(sync.versions.map((v) => v.label)).toEqual([
      "SOW v2 — from Estimate v3 — 93,000 USD",
      "SOW v1 — from Estimate v1 — 50,400 USD",
    ]);
  });

  it("does nothing when the SOW is already up to date", async () => {
    const { projectId, sowV1 } = await projectWithSow("Already Current");
    const result = await updateSowFromEstimateAction(projectId, sowV1.id, undefined, new FormData());
    expect(result?.message).toMatch(/already up to date/i);
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(1);
  });

  it("won't update from an older SOW version, or one whose source is unknown", async () => {
    const { projectId, estimate, sowV1 } = await projectWithSow("Guards");
    await addEstimateVersion(prisma, { ...estimate, versionNumber: 2, total: 66000 });
    expect((await updateSowFromEstimateAction(projectId, sowV1.id, undefined, new FormData()))?.message).toBeUndefined();

    // v1 is no longer the latest SOW version.
    expect((await updateSowFromEstimateAction(projectId, sowV1.id, undefined, new FormData()))?.message).toMatch(
      /newer SOW version/i
    );

    // An unlinked latest version has no estimate to update from.
    const sow = await prisma.sOW.findUniqueOrThrow({ where: { projectId } });
    const unlinked = await prisma.sOWVersion.create({
      data: { sowId: sow.id, versionNumber: 3, fileName: "x.docx", fileBytes: Buffer.from("x"), content: {} },
    });
    expect((await updateSowFromEstimateAction(projectId, unlinked.id, undefined, new FormData()))?.message).toMatch(
      /which estimate/i
    );
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(3);
  });
});
