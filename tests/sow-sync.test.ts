import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// SOW ↔ estimate sync, Phase 2: getSowSyncStatus is the single source of
// truth — staleness is derived at read time by comparing version ids.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const { getSowSyncStatus } = await import("@/lib/sowSync");
const { confirmSowEstimateSourceAction } = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowSyncSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;

async function newProject(name: string): Promise<string> {
  return (await prisma.project.create({ data: { name, workstreamId } })).id;
}

/** A SOW version as generateSowAction now saves it — pinned to `source`, or unlinked when null. */
async function addSowVersion(
  projectId: string,
  versionNumber: number,
  source: { id: string; total: number; currency?: string; capabilities?: ("TECH_AND_DATA" | "EXPERIENCE_DESIGN")[] } | null
): Promise<string> {
  const sow =
    (await prisma.sOW.findUnique({ where: { projectId } })) ?? (await prisma.sOW.create({ data: { projectId } }));
  const version = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber,
      fileName: `sow-v${versionNumber}.docx`,
      fileBytes: Buffer.from("dummy"),
      content: {},
      ...(source
        ? {
            sourceEstimateVersionId: source.id,
            sourceEstimateTotal: source.total,
            sourceEstimateCurrency: source.currency ?? "USD",
            sourceEstimateCapabilities: source.capabilities ?? ["TECH_AND_DATA"],
          }
        : {}),
    },
  });
  return version.id;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowSyncSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({ data: { name: "SowSyncSpecWorkstream", clientId } });
  workstreamId = workstream.id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("getSowSyncStatus", () => {
  it("has nothing to report when there's no SOW", async () => {
    const projectId = await newProject("No SOW");
    expect(await getSowSyncStatus(projectId)).toEqual({ sow: null, versions: [], needsAttention: false });
  });

  it("is in sync when the SOW was built from the estimate's latest version", async () => {
    const projectId = await newProject("In Sync");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    await addSowVersion(projectId, 1, { id: v1, total: 50400 });

    const sync = await getSowSyncStatus(projectId);
    expect(sync.sow).toMatchObject({ status: "in_sync", sowVersionNumber: 1, diff: null });
    expect(sync.sow?.current?.estimateVersionId).toBe(v1);
    expect(sync.needsAttention).toBe(false);
  });

  it("goes stale as soon as a new estimate version is saved, with the diff — and isn't stored anywhere", async () => {
    const projectId = await newProject("Goes Stale");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    await addSowVersion(projectId, 1, { id: v1, total: 50400 });
    expect((await getSowSyncStatus(projectId)).sow?.status).toBe("in_sync");

    await addEstimateVersion(prisma, {
      ...est,
      versionNumber: 2,
      total: 93000,
      capabilities: ["TECH_AND_DATA", "EXPERIENCE_DESIGN"],
    });

    const sync = await getSowSyncStatus(projectId);
    expect(sync.sow).toMatchObject({
      status: "stale",
      source: { estimateVersionId: v1, versionNumber: 1, total: 50400, currency: "USD", estimateLabel: "Main" },
      current: { versionNumber: 2, total: 93000 },
      diff: { totalDelta: 42600, currencyChange: null, capabilitiesAdded: ["EXPERIENCE_DESIGN"], capabilitiesRemoved: [] },
    });
    expect(sync.needsAttention).toBe(true);
  });

  it("follows the estimate the SOW is pinned to — another estimate's new version doesn't make it stale", async () => {
    const projectId = await newProject("Multiple Estimates");
    const a = await createEstimate(prisma, { projectId, clientId, label: "A" });
    const b = await createEstimate(prisma, { projectId, clientId, label: "B" });
    const a1 = await addEstimateVersion(prisma, { ...a, versionNumber: 1, total: 100 });
    await addEstimateVersion(prisma, { ...b, versionNumber: 1, total: 200 });
    await addSowVersion(projectId, 1, { id: a1, total: 100 });

    await addEstimateVersion(prisma, { ...b, versionNumber: 2, total: 250 });
    expect((await getSowSyncStatus(projectId)).sow?.status).toBe("in_sync");

    await addEstimateVersion(prisma, { ...a, versionNumber: 2, total: 150 });
    const sync = await getSowSyncStatus(projectId);
    expect(sync.sow).toMatchObject({ status: "stale", current: { estimateLabel: "A", versionNumber: 2 } });
  });

  it("reports an unlinked SOW, and labels every version with its source", async () => {
    const projectId = await newProject("Unlinked And Labels");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    await addSowVersion(projectId, 1, { id: v1, total: 50400 });
    await addSowVersion(projectId, 2, null);

    const sync = await getSowSyncStatus(projectId);
    expect(sync.sow).toMatchObject({ status: "unlinked", sowVersionNumber: 2, source: null });
    expect(sync.needsAttention).toBe(true);
    expect(sync.versions.map((v) => [v.sowVersionNumber, v.label, v.status])).toEqual([
      [2, "SOW v2 — source unknown", "unlinked"],
      [1, "SOW v1 — from Estimate v1 — 50,400 USD", "in_sync"],
    ]);
  });
});

describe("confirmSowEstimateSourceAction", () => {
  it("lets the PM say which estimate version an unlinked SOW reflects", async () => {
    const projectId = await newProject("Confirm Source");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    const sowVersionId = await addSowVersion(projectId, 1, null);
    const form = new FormData();
    form.set("estimateVersionId", v1);

    const result = await confirmSowEstimateSourceAction(projectId, sowVersionId, undefined, form);

    expect(result?.message).toBeUndefined();
    expect((await getSowSyncStatus(projectId)).sow).toMatchObject({ status: "in_sync", source: { estimateVersionId: v1 } });
    const saved = await prisma.sOWVersion.findUniqueOrThrow({ where: { id: sowVersionId } });
    expect(Number(saved.sourceEstimateTotal)).toBe(50400);
  });

  it("never re-points a SOW that already has a source, or accepts another project's estimate", async () => {
    const projectId = await newProject("Confirm Refused");
    const other = await newProject("Someone Else's");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const otherEst = await createEstimate(prisma, { projectId: other, clientId, label: "Other" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 100 });
    const v2 = await addEstimateVersion(prisma, { ...est, versionNumber: 2, total: 200 });
    const foreign = await addEstimateVersion(prisma, { ...otherEst, versionNumber: 1, total: 999 });
    const linked = await addSowVersion(projectId, 1, { id: v1, total: 100 });
    const unlinked = await addSowVersion(projectId, 2, null);

    const repoint = new FormData();
    repoint.set("estimateVersionId", v2);
    expect((await confirmSowEstimateSourceAction(projectId, linked, undefined, repoint))?.message).toMatch(/already/i);

    const crossProject = new FormData();
    crossProject.set("estimateVersionId", foreign);
    expect((await confirmSowEstimateSourceAction(projectId, unlinked, undefined, crossProject))?.message).toMatch(
      /not found/i
    );

    const rows = await prisma.sOWVersion.findMany({ where: { id: { in: [linked, unlinked] } }, orderBy: { versionNumber: "asc" } });
    expect(rows.map((r) => r.sourceEstimateVersionId)).toEqual([v1, null]);
  });
});
