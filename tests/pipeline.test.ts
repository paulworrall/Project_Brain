import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// Real-DB tests for FB-009 F: the pipeline home page's loader — grouping by
// current step, filters, counts, next action, "Needs review", and a fixed
// number of queries however many projects there are (no N+1).

const { loadPipeline } = await import("@/lib/pipeline");
const { appendScopeSummaryVersion } = await import("@/lib/scopeSummary");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
let queryCount = 0;
const counted = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
counted.$on("query", () => {
  queryCount += 1;
});

const migrated = (
  await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'Project' AND column_name = 'briefAssessment'`
)[0]?.n;
const describeDb = migrated ? describe : describe.skip;

const STAMP = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let hubId: string;
let clientA: string;
let clientB: string;
let wsA: string;
let wsB: string;
let pm: string;
let other: string;
const ids: Record<string, string> = {};
const scope = {
  context: "c",
  outOfScope: [],
  deliverables: [],
  constraints: [],
  assumptions: [],
  openQuestions: [],
};

async function approve(projectId: string, type: "ESTIMATE" | "SOW", versionId: string) {
  await prisma.commercialApproval.create({
    data: {
      projectId,
      documentType: type,
      ...(type === "ESTIMATE" ? { estimateVersionId: versionId } : { sowVersionId: versionId }),
      clientApprovedOn: new Date("2026-11-01"),
      clientApproverName: "Caroline",
      fileSha256: "0".repeat(64),
      recordedByUserId: pm,
      recordedAt: new Date(Date.now() - 2 * DAY),
    },
  });
}

beforeAll(async () => {
  if (!migrated) return;
  const hub = await prisma.hub.create({ data: { name: `TestHub_Pipeline_${STAMP}` } });
  hubId = hub.id;
  clientA = (await prisma.client.create({ data: { name: `PipeA_${STAMP}`, hubId } })).id;
  clientB = (await prisma.client.create({ data: { name: `PipeB_${STAMP}`, hubId } })).id;
  wsA = (await prisma.workstream.create({ data: { name: "A", clientId: clientA } })).id;
  wsB = (await prisma.workstream.create({ data: { name: "B", clientId: clientB } })).id;
  pm = (
    await prisma.user.create({
      data: { name: "Pat", email: `pat-${STAMP}@pipe.test`, passwordHash: "x", role: "DELIVERY" },
    })
  ).id;
  other = (
    await prisma.user.create({
      data: { name: "Sam", email: `sam-${STAMP}@pipe.test`, passwordHash: "x", role: "DELIVERY" },
    })
  ).id;

  // Brief: just created, with an open question.
  const brief = await prisma.project.create({
    data: {
      name: "In brief",
      workstreamId: wsA,
      projectManagerId: pm,
      createdAt: new Date(Date.now() - 3 * DAY),
    },
  });
  await appendScopeSummaryVersion(
    brief.id,
    { ...scope, openQuestions: ["Which market?"] },
    {},
    prisma
  );
  ids.brief = brief.id;

  // Estimate: scope confirmed, an estimate built against v1, then v2 confirmed -> Needs review.
  const est = await prisma.project.create({
    data: { name: "In estimate", workstreamId: wsA, projectManagerId: pm },
  });
  const s1 = await appendScopeSummaryVersion(est.id, scope, {}, prisma);
  const s2 = await appendScopeSummaryVersion(
    est.id,
    { ...scope, deliverables: ["More"] },
    {},
    prisma
  );
  await prisma.projectCapability.create({
    data: { projectId: est.id, capability: "TECH_AND_DATA" },
  });
  const e = await createEstimate(prisma, {
    projectId: est.id,
    clientId: clientA,
    label: `E${STAMP}`,
  });
  const ev = await addEstimateVersion(prisma, {
    ...e,
    versionNumber: 1,
    total: 45675,
    currency: "USD",
  });
  await prisma.estimateVersion.update({ where: { id: ev }, data: { sourceScopeVersionId: s1.id } });
  await prisma.project.update({
    where: { id: est.id },
    data: { scopeConfirmedAt: new Date(Date.now() - 1 * DAY), confirmedScopeVersionId: s2.id },
  });
  ids.estimate = est.id;

  // SOW: estimate approved, no SOW yet. Managed by someone else.
  const sow = await prisma.project.create({
    data: { name: "In SOW", workstreamId: wsB, projectManagerId: other },
  });
  const e2 = await createEstimate(prisma, {
    projectId: sow.id,
    clientId: clientB,
    label: `E2${STAMP}`,
  });
  const ev2 = await addEstimateVersion(prisma, {
    ...e2,
    versionNumber: 1,
    total: 1000,
    currency: "GBP",
  });
  await prisma.project.update({ where: { id: sow.id }, data: { scopeConfirmedAt: new Date() } });
  await approve(sow.id, "ESTIMATE", ev2);
  ids.sow = sow.id;

  // Complete: SOW approved.
  const done = await prisma.project.create({
    data: { name: "Complete", workstreamId: wsB, projectManagerId: pm },
  });
  const e3 = await createEstimate(prisma, {
    projectId: done.id,
    clientId: clientB,
    label: `E3${STAMP}`,
  });
  const ev3 = await addEstimateVersion(prisma, {
    ...e3,
    versionNumber: 1,
    total: 2000,
    currency: "GBP",
  });
  await prisma.project.update({ where: { id: done.id }, data: { scopeConfirmedAt: new Date() } });
  await approve(done.id, "ESTIMATE", ev3);
  const sowDoc = await prisma.sOW.create({ data: { projectId: done.id } });
  const sv = await prisma.sOWVersion.create({
    data: {
      sowId: sowDoc.id,
      versionNumber: 1,
      fileName: "s.docx",
      fileBytes: Buffer.from("PK"),
      content: {},
      sourceEstimateVersionId: ev3,
      sourceEstimateTotal: 2000,
      sourceEstimateCurrency: "GBP",
    },
  });
  await approve(done.id, "SOW", sv.id);
  ids.complete = done.id;
});

afterAll(async () => {
  if (migrated) {
    await prisma.estimate.deleteMany({ where: { project: { workstream: { client: { hubId } } } } });
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.deleteMany({ where: { id: { in: [pm, other] } } });
  }
  await prisma.$disconnect();
  await counted.$disconnect();
});

const all = (clientId: string | null = null) =>
  loadPipeline({ projectManagerId: null, clientId }, prisma);

describeDb("loadPipeline", () => {
  it("groups projects by their current step", async () => {
    const a = await all(clientA);
    const b = await all(clientB);
    expect(a.columns.brief.map((c) => c.id)).toEqual([ids.brief]);
    expect(a.columns.estimate.map((c) => c.id)).toEqual([ids.estimate]);
    expect(b.columns.sow.map((c) => c.id)).toEqual([ids.sow]);
    expect(b.columns.complete.map((c) => c.id)).toEqual([ids.complete]);
  });

  it("filters by client and by PM (My projects)", async () => {
    const mine = await loadPipeline({ projectManagerId: pm, clientId: clientB }, prisma);
    expect(mine.columns.sow).toEqual([]);
    expect(mine.columns.complete.map((c) => c.id)).toEqual([ids.complete]);
    const a = await all(clientA);
    expect(Object.values(a.columns).flat().length).toBe(2);
  });

  it("shows client, PM, next action, estimate total, days in step and Needs review", async () => {
    const a = await all(clientA);
    const [brief] = a.columns.brief;
    expect(brief).toMatchObject({
      name: "In brief",
      clientName: `PipeA_${STAMP}`,
      pmName: "Pat",
      nextAction: "Send the clarification email",
      estimateTotal: null,
      daysInStep: 3,
      needsReview: false,
    });
    const [estimate] = a.columns.estimate;
    expect(estimate).toMatchObject({
      nextAction: "Review the estimate: scope changed",
      estimateTotal: { amount: 45675, currency: "USD" },
      daysInStep: 1,
      needsReview: true,
    });
    const b = await all(clientB);
    expect(b.columns.sow[0].nextAction).toBe("Generate the SOW");
    expect(b.columns.sow[0].daysInStep).toBe(2);
    expect(b.columns.complete[0].nextAction).toBe("Project complete: SOW approved");
  });

  it("runs a fixed number of queries however many projects it loads (no N+1)", async () => {
    queryCount = 0;
    await loadPipeline({ projectManagerId: null, clientId: clientA }, counted);
    const forTwo = queryCount;
    queryCount = 0;
    await loadPipeline({ projectManagerId: null, clientId: null }, counted);
    const forAll = queryCount;
    expect(forTwo).toBeGreaterThan(0);
    expect(forAll).toBe(forTwo);
  });
});
