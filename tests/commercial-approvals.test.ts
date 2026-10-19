import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NextRequest } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";
import { seedSowItems } from "./helpers/sowItems";

// Real-DB integration test for FB-005 (client approval of estimates/SOWs):
// the rules in approvalService, the server-side locks on every mutating
// action, the database invariants and the immutability of approved downloads.
// Skipped (loudly) until the CommercialApproval migration is applied.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Generation is driven by a hook so a test can land an approval "mid-generation".
let duringGeneration: (() => Promise<void>) | null = null;
vi.mock("@/services/agents/sow-agent", () => ({
  SowAgentError: class SowAgentError extends Error {},
  generateSowContent: vi.fn(async () => {
    await duringGeneration?.();
    return {};
  }),
}));
vi.mock("@/services/documents/sow-docx", () => ({
  renderSowDocx: vi.fn(async () => Buffer.from("PK generated sow docx")),
}));

const { approveVersion, undoApproval, revertApproval } =
  await import("@/lib/commercial/approvalService");
const { assertEstimateEditable, assertSowEditable, CommercialLockedError } =
  await import("@/lib/commercial/approvalGuards");
const { getProjectApprovals, stageStatusWithApprovals } =
  await import("@/lib/commercial/approvalViewData");
const { ADMIN_ROLES } = await import("@/lib/permissions");
const { createEstimateAction, saveEstimateVersionAction, resolveRoleResolutionAction } =
  await import("@/app/(dashboard)/projects/[projectId]/estimates/actions");
const { startSowDevelopmentAction, generateSowAction } =
  await import("@/app/(dashboard)/projects/[projectId]/actions");
const { startSowReviewAction } =
  await import("@/app/(dashboard)/projects/[projectId]/sow-review-actions");
const { GET: downloadEstimate } =
  await import("@/app/api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]/route");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const tableExists = (
  await prisma.$queryRaw<
    { t: string | null }[]
  >`SELECT to_regclass('"CommercialApproval"')::text AS t`
)[0]?.t;

const TEST_HUB_NAME = "TestHub_CommercialApprovalsSpec";
const STAMP = Date.now();

let hubId: string;
let clientId: string;
let workstreamId: string;
let pm: { id: string; role: "DELIVERY" };
let other: { id: string; role: "CLIENT_ENGAGEMENT" };
let n = 0;

const input = (versionId: string, extra: Record<string, unknown> = {}) => ({
  versionId,
  clientApprovedOn: "2026-10-18",
  clientApproverName: "Caroline",
  ...extra,
});

/** A fresh project with one estimate (v1, v2) and one SOW (v1) built from estimate v2. */
async function makeProject() {
  n += 1;
  const project = await prisma.project.create({
    data: { name: `Approvals Spec Project ${n}`, workstreamId },
  });
  const projectId = project.id;
  const estimate = await createEstimate(prisma, { projectId, clientId, label: `Estimate ${n}` });
  const ev1 = await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 1000 });
  const ev2 = await addEstimateVersion(prisma, { ...estimate, versionNumber: 2, total: 2000 });
  const sow = await prisma.sOW.create({ data: { projectId } });
  const sv1 = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber: 1,
      fileName: "sow-v1.docx",
      fileBytes: Buffer.from("PK sow v1"),
      content: {},
      sourceEstimateVersionId: ev2,
      sourceEstimateTotal: 2000,
      sourceEstimateCurrency: "USD",
    },
  });
  return { projectId, estimate, ev1, ev2, sowId: sow.id, sv1: sv1.id };
}

const describeDb = tableExists ? describe : describe.skip;
if (!tableExists) {
  console.warn(
    "[commercial-approvals] CommercialApproval table missing — apply the 20261019100000 migration to run these tests."
  );
}

beforeAll(async () => {
  if (!tableExists) return;
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "ApprovalsSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "ApprovalsSpecWs", clientId },
  });
  workstreamId = workstream.id;
  const a = await prisma.user.create({
    data: {
      name: "Pat PM",
      email: `pat-${STAMP}@approvals.test`,
      passwordHash: "x",
      role: "DELIVERY",
    },
  });
  const b = await prisma.user.create({
    data: {
      name: "Olly Other",
      email: `olly-${STAMP}@approvals.test`,
      passwordHash: "x",
      role: "CLIENT_ENGAGEMENT",
    },
  });
  pm = { id: a.id, role: "DELIVERY" };
  other = { id: b.id, role: "CLIENT_ENGAGEMENT" };
  mockAuth.mockResolvedValue({ user: pm });
});

afterAll(async () => {
  if (tableExists) {
    await prisma.estimate.deleteMany({ where: { project: { workstream: { clientId } } } });
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, other.id] } } });
  }
  await prisma.$disconnect();
});

describeDb("approving", () => {
  it("records an approval against the exact version, with the file's SHA-256", async () => {
    const p = await makeProject();
    const result = await approveVersion(
      prisma,
      pm,
      "ESTIMATE",
      input(p.ev2, { reference: "PO-1" })
    );
    expect(result.ok).toBe(true);
    const row = await prisma.commercialApproval.findFirstOrThrow({
      where: { estimateVersionId: p.ev2 },
    });
    expect(row).toMatchObject({
      projectId: p.projectId,
      documentType: "ESTIMATE",
      clientApproverName: "Caroline",
      reference: "PO-1",
      recordedByUserId: pm.id,
      revokedAt: null,
    });
    expect(row.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.clientApprovedOn.toISOString().slice(0, 10)).toBe("2026-10-18");
  });

  it("refuses anyone who isn't signed in, and invalid input with field errors", async () => {
    const p = await makeProject();
    const denied = await approveVersion(prisma, null, "ESTIMATE", input(p.ev2));
    expect(denied).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const invalid = await approveVersion(
      prisma,
      pm,
      "ESTIMATE",
      input(p.ev2, { clientApproverName: " ", clientApprovedOn: "2999-01-01" })
    );
    expect(invalid).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(invalid.ok === false && invalid.fieldErrors).toMatchObject({
      clientApproverName: expect.any(String),
      clientApprovedOn: "The approval date can't be in the future.",
    });
  });

  it("only approves the latest version", async () => {
    const p = await makeProject();
    expect(await approveVersion(prisma, pm, "ESTIMATE", input(p.ev1))).toMatchObject({
      ok: false,
      code: "NOT_LATEST_VERSION",
    });
  });

  it("lets exactly one of two concurrent approvals win", async () => {
    const p = await makeProject();
    const results = await Promise.all([
      approveVersion(prisma, pm, "ESTIMATE", input(p.ev2)),
      approveVersion(prisma, other, "ESTIMATE", input(p.ev2)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, code: "ALREADY_APPROVED" });
    expect(
      await prisma.commercialApproval.count({ where: { projectId: p.projectId, revokedAt: null } })
    ).toBe(1);
  });

  it("won't approve a second estimate while one is approved — in code and in the database", async () => {
    const p = await makeProject();
    const second = await createEstimate(prisma, {
      projectId: p.projectId,
      clientId,
      label: "Second",
    });
    const secondV1 = await addEstimateVersion(prisma, { ...second, versionNumber: 1, total: 5 });
    await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    expect(await approveVersion(prisma, pm, "ESTIMATE", input(secondV1))).toMatchObject({
      ok: false,
      code: "ALREADY_APPROVED",
    });
    // The partial unique index holds even if the code check is bypassed.
    await expect(
      prisma.commercialApproval.create({
        data: {
          projectId: p.projectId,
          documentType: "ESTIMATE",
          estimateVersionId: secondV1,
          clientApprovedOn: new Date("2026-10-18"),
          clientApproverName: "X",
          fileSha256: "0".repeat(64),
          recordedByUserId: pm.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("blocks a SOW until the estimate is approved, and unless it came from that estimate version", async () => {
    const p = await makeProject();
    expect(await approveVersion(prisma, pm, "SOW", input(p.sv1))).toMatchObject({
      ok: false,
      code: "ESTIMATE_NOT_APPROVED",
    });

    // Approve estimate v2 -> SOW v1 (from v2) is fine; make a SOW from the wrong version to compare.
    await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    const wrong = await prisma.sOWVersion.create({
      data: {
        sowId: p.sowId,
        versionNumber: 2,
        fileName: "sow-v2.docx",
        fileBytes: Buffer.from("PK sow v2"),
        content: {},
        sourceEstimateVersionId: p.ev1,
      },
    });
    expect(await approveVersion(prisma, pm, "SOW", input(wrong.id))).toMatchObject({
      ok: false,
      code: "SOW_SOURCE_MISMATCH",
    });
    expect(await approveVersion(prisma, pm, "SOW", input(p.sv1))).toMatchObject({
      ok: false,
      code: "NOT_LATEST_VERSION",
    });
  });

  it("approves a SOW built from the approved estimate version", async () => {
    const p = await makeProject();
    await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    expect(await approveVersion(prisma, pm, "SOW", input(p.sv1))).toMatchObject({ ok: true });
    const approvals = await getProjectApprovals(prisma, p.projectId);
    expect(approvals.summary.sow?.versionNumber).toBe(1);
    expect(approvals.summary.estimate?.total).toBe(2000);
  });
});

describeDb("locks on every mutating action", () => {
  it("rejects estimate and SOW mutations once their document is approved", async () => {
    const p = await makeProject();
    await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));

    await expect(assertEstimateEditable(p.projectId, prisma)).rejects.toBeInstanceOf(
      CommercialLockedError
    );
    await expect(assertSowEditable(p.projectId, prisma)).resolves.toBeUndefined();

    const created = await createEstimateAction(
      p.projectId,
      undefined,
      (() => {
        const fd = new FormData();
        fd.set("label", "Another");
        fd.set("rateCardVersionId", p.estimate.rateCardVersionId);
        return fd;
      })()
    );
    expect(created.message).toMatch(/^Locked — the client approved v2/);

    const saved = await saveEstimateVersionAction(p.estimate.estimateId, undefined, new FormData());
    expect(saved.message).toMatch(/^Locked/);

    const resolved = await resolveRoleResolutionAction(
      (
        await prisma.roleResolution.create({
          data: {
            estimateId: p.estimate.estimateId,
            estimateCapabilityInputId: (
              await prisma.estimateCapabilityInput.create({
                data: { estimateId: p.estimate.estimateId, source: "PASTE", rawContent: "x" },
              })
            ).id,
            capability: "TECH_AND_DATA",
            rawRoleText: "dev",
            extractedRole: "dev",
            extractedQuantity: 1,
            matchType: "NO_MATCH",
            confidence: 0,
          },
        })
      ).id,
      undefined,
      (() => {
        const fd = new FormData();
        fd.set("rateCardLineItemId", "whatever");
        fd.set("unit", "HOURS");
        return fd;
      })()
    );
    expect(resolved.message).toMatch(/^Locked/);
    expect(await prisma.estimate.count({ where: { projectId: p.projectId } })).toBe(1);

    // Approve the SOW too: template change and review are locked.
    await approveVersion(prisma, pm, "SOW", input(p.sv1));
    const template = await startSowDevelopmentAction(
      p.projectId,
      undefined,
      (() => {
        const fd = new FormData();
        fd.set("sowTemplateId", "t");
        fd.set("sowTemplateVersionId", "v");
        return fd;
      })()
    );
    expect(template?.message).toMatch(/^Locked/);
    expect(await startSowReviewAction(p.projectId)).toMatchObject({
      message: expect.stringMatching(/^Locked/),
    });
    const regenerated = await generateSowAction(p.projectId, undefined, new FormData());
    expect(regenerated?.message).toMatch(/^Locked/);
    expect(await prisma.sOWVersion.count({ where: { sowId: p.sowId } })).toBe(1);
  });

  it("doesn't overwrite an approval that lands mid-generation (regenerate-SOW race)", async () => {
    const p = await makeProject();
    // Preconditions for generateSowAction: template, confirmed key details, validated items.
    const template = await prisma.sOWTemplate.create({
      data: { name: "T", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
    });
    const templateVersion = await prisma.sOWTemplateVersion.create({
      data: {
        sowTemplateId: template.id,
        versionNumber: 1,
        fileName: "t.docx",
        fileBytes: Buffer.from("x"),
        extractedText: "Overview, Scope, Fees.",
      },
    });
    await prisma.project.update({
      where: { id: p.projectId },
      data: { sowTemplateId: template.id, sowTemplateVersionId: templateVersion.id },
    });
    await prisma.briefAttributeValue.createMany({
      data: [
        { attributeId: "budget", values: { amount: "£50k", currency: "GBP" } },
        {
          attributeId: "objective",
          values: { objective: "Relaunch", successMeasures: "More actives" },
        },
        { attributeId: "timeline", values: { startDate: "2026-10-01" } },
        {
          attributeId: "clientContact",
          values: { name: "Caroline", email: "caroline@fizzy.example" },
        },
      ].map((row) => ({
        ...row,
        projectId: p.projectId,
        kind: "CONFIRMED" as const,
        source: "PM_ENTRY" as const,
      })),
    });
    await seedSowItems(prisma, p.projectId);
    await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));

    // The approval lands while the agent is still "writing".
    duringGeneration = async () => {
      const r = await approveVersion(prisma, other, "SOW", input(p.sv1));
      expect(r.ok).toBe(true);
    };
    try {
      const result = await generateSowAction(p.projectId, undefined, new FormData());
      expect(result?.message).toMatch(/^Locked — the client approved v1/);
    } finally {
      duringGeneration = null;
    }
    expect(await prisma.sOWVersion.count({ where: { sowId: p.sowId } })).toBe(1);
  });
});

describeDb("undo and revert", () => {
  it("lets the approving user undo inside the window, restoring draft, editing and stage status", async () => {
    const p = await makeProject();
    const approved = await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    if (!approved.ok) throw new Error("setup");
    let approvals = await getProjectApprovals(prisma, p.projectId);
    expect(stageStatusWithApprovals(6, "NOT_STARTED", approvals.summary)).toBe("COMPLETE");

    expect(await undoApproval(prisma, pm, { approvalId: approved.data.approvalId })).toMatchObject({
      ok: true,
    });
    const row = await prisma.commercialApproval.findUniqueOrThrow({
      where: { id: approved.data.approvalId },
    });
    expect(row).toMatchObject({ revokeKind: "UNDO", revokedByUserId: pm.id });
    await expect(assertEstimateEditable(p.projectId, prisma)).resolves.toBeUndefined();
    approvals = await getProjectApprovals(prisma, p.projectId);
    expect(approvals.summary.estimate).toBeNull();
    expect(stageStatusWithApprovals(6, "NOT_STARTED", approvals.summary)).toBe("NOT_STARTED");
    // The row is kept, and the version can be approved again.
    expect(await approveVersion(prisma, other, "ESTIMATE", input(p.ev2))).toMatchObject({
      ok: true,
    });
  });

  it("refuses an undo by someone else, or after the window", async () => {
    const p = await makeProject();
    const approved = await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    if (!approved.ok) throw new Error("setup");
    expect(
      await undoApproval(prisma, other, { approvalId: approved.data.approvalId })
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    await prisma.commercialApproval.update({
      where: { id: approved.data.approvalId },
      data: { recordedAt: new Date(Date.now() - 60_000) },
    });
    expect(await undoApproval(prisma, pm, { approvalId: approved.data.approvalId })).toMatchObject({
      ok: false,
      code: "UNDO_WINDOW_EXPIRED",
    });
    await expect(assertEstimateEditable(p.projectId, prisma)).rejects.toBeInstanceOf(
      CommercialLockedError
    );
  });

  it("won't undo the estimate approval while the SOW approved from it stands", async () => {
    const p = await makeProject();
    const est = await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    await approveVersion(prisma, pm, "SOW", input(p.sv1));
    if (!est.ok) throw new Error("setup");
    expect(await undoApproval(prisma, pm, { approvalId: est.data.approvalId })).toMatchObject({
      ok: false,
      code: "LOCKED",
    });
  });

  it("lets only an admin revert, with a reason, recording it and unlocking", async () => {
    const p = await makeProject();
    const approved = await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    if (!approved.ok) throw new Error("setup");
    await prisma.commercialApproval.update({
      where: { id: approved.data.approvalId },
      data: { recordedAt: new Date(Date.now() - 60_000) },
    });

    // A PM can't revert (nobody can until an admin role exists).
    expect(
      await revertApproval(prisma, pm, {
        approvalId: approved.data.approvalId,
        reason: "Client changed mind",
      })
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });

    (ADMIN_ROLES as string[]).push("CLIENT_ENGAGEMENT");
    try {
      expect(
        await revertApproval(prisma, other, { approvalId: approved.data.approvalId, reason: "  " })
      ).toMatchObject({
        ok: false,
        code: "VALIDATION",
      });
      expect(
        await revertApproval(prisma, other, {
          approvalId: approved.data.approvalId,
          reason: "Client changed mind",
        })
      ).toMatchObject({ ok: true });
    } finally {
      (ADMIN_ROLES as string[]).pop();
    }
    const row = await prisma.commercialApproval.findUniqueOrThrow({
      where: { id: approved.data.approvalId },
    });
    expect(row).toMatchObject({
      revokeKind: "ADMIN_REVERT",
      revokeReason: "Client changed mind",
      revokedByUserId: other.id,
    });
    await expect(assertEstimateEditable(p.projectId, prisma)).resolves.toBeUndefined();
  });
});

describeDb("approved downloads", () => {
  it("serve identical bytes before and after a rate card change, matching the recorded SHA-256", async () => {
    const p = await makeProject();
    const approved = await approveVersion(prisma, pm, "ESTIMATE", input(p.ev2));
    if (!approved.ok) throw new Error("setup");
    const download = async () => {
      const response = await downloadEstimate({} as NextRequest, {
        params: Promise.resolve({
          projectId: p.projectId,
          estimateId: p.estimate.estimateId,
          versionId: p.ev2,
        }),
      });
      return Buffer.from(await response.arrayBuffer());
    };
    const before = await download();

    // "Promote" a new rate card version and change the template file.
    await prisma.rateCardVersion.update({
      where: { id: p.estimate.rateCardVersionId },
      data: {
        extractedText: "totally different rates",
        fileBytes: Buffer.from("new rate card file"),
      },
    });
    const after = await download();

    expect(after.equals(before)).toBe(true);
    const { createHash } = await import("node:crypto");
    const row = await prisma.commercialApproval.findUniqueOrThrow({
      where: { id: approved.data.approvalId },
    });
    expect(createHash("sha256").update(after).digest("hex")).toBe(row.fileSha256);
  });
});
