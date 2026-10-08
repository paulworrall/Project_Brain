import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { seedSowItems } from "./helpers/sowItems";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// SOW ↔ estimate sync, Phase 1: every new SOW version records the exact
// estimate version it was built from, plus a snapshot; existing SOW versions
// are linked by an idempotent backfill only where that's unambiguous.

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
const { backfillSowEstimateLinks } = await import("@/lib/sowEstimateLink");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowEstimateLinkSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;
let templateId: string;
let templateVersionId: string;

const sowBody = {
  scopeSummary: { objectives: ["Relaunch the app"], background: "Background." },
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
  assumptions: [],
  outOfScope: [],
  risks: [],
};

/** A project that passes the SOW brief gate, with a template selected. */
async function sowReadyProject(name: string): Promise<string> {
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
  return project.id;
}

/** A legacy SOW version as saved before the link existed: commercials frozen in content only. */
async function legacySowVersion(
  projectId: string,
  versionNumber: number,
  createdAt: Date,
  commercials: { totalValue: number; currency: string } | null
): Promise<string> {
  const sow =
    (await prisma.sOW.findUnique({ where: { projectId } })) ??
    (await prisma.sOW.create({ data: { projectId } }));
  const version = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber,
      fileName: `sow-v${versionNumber}.docx`,
      fileBytes: Buffer.from("dummy"),
      content: {
        coverDetails: { commercials: commercials ? { ...commercials, description: "x" } : null },
        body: sowBody,
      },
      createdAt,
    },
  });
  return version.id;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowLinkSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({ data: { name: "SowLinkSpecWorkstream", clientId } });
  workstreamId = workstream.id;
  const template = await prisma.sOWTemplate.create({
    data: { name: "Link Spec Template", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
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

describe("SOW generation records its source estimate version", () => {
  it("records the exact estimate version used, with a snapshot of total, currency and capabilities", async () => {
    const projectId = await sowReadyProject("Records Source");
    const { estimateId, rateCardVersionId } = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    await addEstimateVersion(prisma, { estimateId, rateCardVersionId, versionNumber: 1, total: 50400 });
    const v2 = await addEstimateVersion(prisma, {
      estimateId,
      rateCardVersionId,
      versionNumber: 2,
      total: 66000,
      capabilities: ["TECH_AND_DATA", "EXPERIENCE_DESIGN"],
    });

    await seedSowItems(prisma, projectId);
    mockParse.mockResolvedValueOnce({ parsed_output: sowBody });
    const result = await generateSowAction(projectId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const version = await prisma.sOWVersion.findFirstOrThrow({ where: { sow: { projectId } } });
    expect(version.sourceEstimateVersionId).toBe(v2);
    expect(Number(version.sourceEstimateTotal)).toBe(66000);
    expect(version.sourceEstimateCurrency).toBe("USD");
    expect(version.sourceEstimateCapabilities).toEqual(["TECH_AND_DATA", "EXPERIENCE_DESIGN"]);
  });

  it("refuses to generate without a saved estimate version — every new SOW must have a source", async () => {
    const projectId = await sowReadyProject("No Estimate Yet");

    const result = await generateSowAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/save an estimate/i);
    expect(mockParse).not.toHaveBeenCalled();
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(0);
  });
});

describe("backfillSowEstimateLinks", () => {
  it("links a legacy SOW version to the latest estimate version saved before it, with a snapshot", async () => {
    const projectId = await sowReadyProject("Backfill Unambiguous");
    const { estimateId, rateCardVersionId } = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    await addEstimateVersion(prisma, {
      estimateId, rateCardVersionId, versionNumber: 1, total: 50400, createdAt: new Date("2026-09-24T10:00:00Z"),
    });
    const v2 = await addEstimateVersion(prisma, {
      estimateId, rateCardVersionId, versionNumber: 2, total: 66000, createdAt: new Date("2026-09-28T10:00:00Z"),
    });
    // v3 comes after the SOW — must not be picked.
    await addEstimateVersion(prisma, {
      estimateId, rateCardVersionId, versionNumber: 3, total: 93000, createdAt: new Date("2026-10-01T10:00:00Z"),
    });
    const sowVersion = await legacySowVersion(projectId, 1, new Date("2026-09-29T10:00:00Z"), {
      totalValue: 66000,
      currency: "USD",
    });

    const report = await backfillSowEstimateLinks(prisma, { projectId });

    expect(report.linked).toEqual([{ sowVersionId: sowVersion, estimateVersionId: v2 }]);
    expect(report.unlinked).toEqual([]);
    const linked = await prisma.sOWVersion.findUniqueOrThrow({ where: { id: sowVersion } });
    expect(linked.sourceEstimateVersionId).toBe(v2);
    expect(Number(linked.sourceEstimateTotal)).toBe(66000);
    expect(linked.sourceEstimateCurrency).toBe("USD");
    expect(linked.sourceEstimateCapabilities).toEqual(["TECH_AND_DATA"]);
  });

  it("leaves ambiguous or unsupported cases unlinked, saying why", async () => {
    // No estimate version before the SOW.
    const noPrior = await sowReadyProject("Backfill No Prior");
    const est = await createEstimate(prisma, { projectId: noPrior, clientId, label: "Late" });
    const noPriorSow = await legacySowVersion(noPrior, 1, new Date("2026-09-20T10:00:00Z"), {
      totalValue: 10, currency: "USD",
    });
    await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 10, createdAt: new Date("2026-09-21T10:00:00Z") });

    // Two estimates with versions before the SOW.
    const multiple = await sowReadyProject("Backfill Multiple");
    const a = await createEstimate(prisma, { projectId: multiple, clientId, label: "A" });
    const b = await createEstimate(prisma, { projectId: multiple, clientId, label: "B" });
    await addEstimateVersion(prisma, { ...a, versionNumber: 1, total: 100, createdAt: new Date("2026-09-01T10:00:00Z") });
    await addEstimateVersion(prisma, { ...b, versionNumber: 1, total: 200, createdAt: new Date("2026-09-02T10:00:00Z") });
    const multipleSow = await legacySowVersion(multiple, 1, new Date("2026-09-03T10:00:00Z"), {
      totalValue: 200, currency: "USD",
    });

    // The SOW's frozen figures don't match the candidate.
    const mismatch = await sowReadyProject("Backfill Mismatch");
    const m = await createEstimate(prisma, { projectId: mismatch, clientId, label: "M" });
    await addEstimateVersion(prisma, { ...m, versionNumber: 1, total: 500, createdAt: new Date("2026-09-01T10:00:00Z") });
    const mismatchSow = await legacySowVersion(mismatch, 1, new Date("2026-09-02T10:00:00Z"), {
      totalValue: 999, currency: "USD",
    });

    // A SOW generated with no estimate at all.
    const noFigures = await sowReadyProject("Backfill No Figures");
    const noFiguresSow = await legacySowVersion(noFigures, 1, new Date("2026-09-02T10:00:00Z"), null);

    const reports = await Promise.all(
      [noPrior, multiple, mismatch, noFigures].map((projectId) => backfillSowEstimateLinks(prisma, { projectId }))
    );

    expect(reports.flatMap((r) => r.linked)).toEqual([]);
    expect(reports.flatMap((r) => r.unlinked)).toEqual([
      { sowVersionId: noPriorSow, reason: "no-prior-estimate-version" },
      { sowVersionId: multipleSow, reason: "multiple-estimates" },
      { sowVersionId: mismatchSow, reason: "figures-mismatch" },
      { sowVersionId: noFiguresSow, reason: "no-estimate-figures" },
    ]);
    const stillUnlinked = await prisma.sOWVersion.count({
      where: { id: { in: [noPriorSow, multipleSow, mismatchSow, noFiguresSow] }, sourceEstimateVersionId: { not: null } },
    });
    expect(stillUnlinked).toBe(0);
  });

  it("is idempotent — a second run changes nothing and never re-links an already linked version", async () => {
    const projectId = await sowReadyProject("Backfill Idempotent");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, {
      ...est, versionNumber: 1, total: 700, createdAt: new Date("2026-09-01T10:00:00Z"),
    });
    const sowVersion = await legacySowVersion(projectId, 1, new Date("2026-09-02T10:00:00Z"), {
      totalValue: 700, currency: "USD",
    });

    const first = await backfillSowEstimateLinks(prisma, { projectId });
    const after = await prisma.sOWVersion.findUniqueOrThrow({ where: { id: sowVersion } });
    const second = await backfillSowEstimateLinks(prisma, { projectId });

    expect(first.linked).toEqual([{ sowVersionId: sowVersion, estimateVersionId: v1 }]);
    expect(second).toEqual({ linked: [], unlinked: [], alreadyLinked: 1 });
    expect(await prisma.sOWVersion.findUniqueOrThrow({ where: { id: sowVersion } })).toEqual(after);
  });
});
