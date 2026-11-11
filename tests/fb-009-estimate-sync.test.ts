import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// Real-DB test for FB-009 B: getEstimateScopeSyncStatus. Skipped until the
// FB-009 migration is applied.

const { getEstimateScopeSyncStatus } = await import("@/lib/estimateScopeSync");
const { appendScopeSummaryVersion } = await import("@/lib/scopeSummary");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const migrated = (
  await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'EstimateVersion' AND column_name = 'sourceScopeVersionId'`
)[0]?.n;
const describeDb = migrated ? describe : describe.skip;

const STAMP = Date.now();
let hubId: string;
let clientId: string;
let workstreamId: string;
let userId: string;
let n = 0;

const scope = {
  context: "c",
  outOfScope: [],
  deliverables: ["Concept"],
  constraints: [],
  assumptions: [],
  openQuestions: [],
};

/** A project whose estimate v1 was built against scope v1, then scope v2 confirmed. */
async function staleProject() {
  n += 1;
  const project = await prisma.project.create({ data: { name: `Sync ${n}`, workstreamId } });
  const s1 = await appendScopeSummaryVersion(project.id, scope, {}, prisma);
  const s2 = await appendScopeSummaryVersion(
    project.id,
    { ...scope, deliverables: ["Concept", "Toolkit"] },
    {},
    prisma
  );
  const estimate = await createEstimate(prisma, {
    projectId: project.id,
    clientId,
    label: `Est ${n}`,
  });
  const ev1 = await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 1000 });
  await prisma.estimateVersion.update({
    where: { id: ev1 },
    data: { sourceScopeVersionId: s1.id },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { confirmedScopeVersionId: s2.id },
  });
  return { projectId: project.id, estimateId: estimate.estimateId, ev1, s1, s2 };
}

beforeAll(async () => {
  if (!migrated) return;
  const hub = await prisma.hub.create({ data: { name: `TestHub_Fb009Sync_${STAMP}` } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "Fb009SyncClient", hubId } });
  clientId = client.id;
  const ws = await prisma.workstream.create({ data: { name: "Fb009SyncWs", clientId } });
  workstreamId = ws.id;
  const user = await prisma.user.create({
    data: {
      name: "Pat",
      email: `pat-${STAMP}@fb009sync.test`,
      passwordHash: "x",
      role: "DELIVERY",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  if (migrated) {
    await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describeDb("getEstimateScopeSyncStatus", () => {
  it("flags an estimate built against an older confirmed scope, with the changed sections", async () => {
    const p = await staleProject();
    const sync = await getEstimateScopeSyncStatus(p.projectId, prisma);
    expect(sync.needsReview).toBe(true);
    expect(sync.estimates).toEqual([
      expect.objectContaining({
        estimateId: p.estimateId,
        status: "stale",
        sourceVersionNumber: 1,
        confirmedVersionNumber: 2,
        changedSections: ["Deliverables"],
        approved: false,
      }),
    ]);
  });

  it("clears once a new estimate version is saved against the confirmed scope", async () => {
    const p = await staleProject();
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: p.estimateId } });
    const ev2 = await addEstimateVersion(prisma, {
      estimateId: p.estimateId,
      rateCardVersionId: estimate.rateCardVersionId,
      versionNumber: 2,
      total: 1200,
    });
    await prisma.estimateVersion.update({
      where: { id: ev2 },
      data: { sourceScopeVersionId: p.s2.id },
    });
    const sync = await getEstimateScopeSyncStatus(p.projectId, prisma);
    expect(sync.needsReview).toBe(false);
    expect(sync.estimates[0].status).toBe("in_sync");
  });

  it("marks an approved estimate's flag as information only", async () => {
    const p = await staleProject();
    await prisma.commercialApproval.create({
      data: {
        projectId: p.projectId,
        documentType: "ESTIMATE",
        estimateVersionId: p.ev1,
        clientApprovedOn: new Date("2026-11-05"),
        clientApproverName: "Caroline",
        fileSha256: "0".repeat(64),
        recordedByUserId: userId,
      },
    });
    const sync = await getEstimateScopeSyncStatus(p.projectId, prisma);
    expect(sync.estimates[0]).toMatchObject({ status: "stale", approved: true });
  });

  it("never flags a legacy estimate with no scope source", async () => {
    n += 1;
    const project = await prisma.project.create({ data: { name: `Legacy ${n}`, workstreamId } });
    const s1 = await appendScopeSummaryVersion(project.id, scope, {}, prisma);
    await prisma.project.update({
      where: { id: project.id },
      data: { confirmedScopeVersionId: s1.id },
    });
    const estimate = await createEstimate(prisma, {
      projectId: project.id,
      clientId,
      label: `Legacy est ${n}`,
    });
    await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 500 });
    const sync = await getEstimateScopeSyncStatus(project.id, prisma);
    expect(sync.estimates[0].status).toBe("unlinked");
    expect(sync.needsReview).toBe(false);
  });
});
