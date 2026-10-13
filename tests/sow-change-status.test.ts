import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// getSowChangeStatus: derived at read time by comparing the latest SOW
// version's generation-time snapshot with the project now. Real database,
// throwaway hub; SOW versions are saved the way generateSowAction saves them
// (including snapshotMaterialKeyDetails).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const { getSowChangeStatus, snapshotMaterialKeyDetails } = await import("@/lib/sowChangeStatus");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowChangeStatusSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;

// Everything the tests write "later" is stamped in the future, in order.
let tick = 0;
const later = () => new Date(Date.now() + 60_000 + ++tick * 1000);

async function newProject(name: string): Promise<string> {
  return (await prisma.project.create({ data: { name, workstreamId } })).id;
}

async function setValue(
  projectId: string,
  attributeId: string,
  values: Record<string, unknown>,
  opts: { source?: "BRIEF" | "UPDATE" | "PM_ENTRY"; kind?: "SUGGESTION" | "CONFIRMED"; knowledgeItemId?: string; createdAt?: Date } = {}
) {
  await prisma.briefAttributeValue.create({
    data: {
      projectId,
      attributeId,
      kind: opts.kind ?? "SUGGESTION",
      source: opts.source ?? "BRIEF",
      values: values as never,
      knowledgeItemId: opts.knowledgeItemId,
      createdAt: opts.createdAt ?? new Date(Date.now() - 60_000),
    },
  });
}

async function addUpdate(projectId: string, versionNumber: number, changeSummary: string | null, source: "CLIENT" | "INTERNAL_TEAM" = "CLIENT") {
  return prisma.knowledgeItem.create({
    data: { projectId, type: "NOTE", content: `Update ${versionNumber}`, versionNumber, changeSummary, source },
  });
}

/** A SOW version saved as generateSowAction saves it. */
async function generateSow(projectId: string, versionNumber: number, estimateVersionId?: string, total = 50400) {
  const sow = (await prisma.sOW.findUnique({ where: { projectId } })) ?? (await prisma.sOW.create({ data: { projectId } }));
  const snapshot = await snapshotMaterialKeyDetails(projectId);
  const version = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber,
      fileName: `sow-v${versionNumber}.docx`,
      fileBytes: Buffer.from("dummy"),
      content: {},
      keyAttributesSnapshot: snapshot as never,
      ...(estimateVersionId
        ? {
            sourceEstimateVersionId: estimateVersionId,
            sourceEstimateTotal: total,
            sourceEstimateCurrency: "USD",
            sourceEstimateCapabilities: ["TECH_AND_DATA"],
          }
        : {}),
    },
  });
  return version.id;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  clientId = (await prisma.client.create({ data: { name: "SowChangeSpecClient", hubId } })).id;
  workstreamId = (await prisma.workstream.create({ data: { name: "SowChangeSpecWorkstream", clientId } })).id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("getSowChangeStatus", () => {
  it("returns no_sow when no SOW exists", async () => {
    const projectId = await newProject("No SOW");
    expect(await getSowChangeStatus(projectId)).toEqual({
      status: "no_sow",
      changes: [],
      sowVersionId: null,
      sowVersionNumber: null,
      estimateSync: null,
      versions: [],
    });
  });

  it("is up_to_date right after generation", async () => {
    const projectId = await newProject("Fresh");
    await setValue(projectId, "budget", { amount: "€110,000 (EUR)" });
    await generateSow(projectId, 1);

    const result = await getSowChangeStatus(projectId);
    expect(result).toMatchObject({ status: "up_to_date", changes: [], sowVersionNumber: 1 });
  });

  it("is changed_since_generation after a material key-detail change, naming the update, its date, source, fields and summary", async () => {
    const projectId = await newProject("Budget Changed");
    await setValue(projectId, "budget", { amount: "€110,000 (EUR)" });
    await generateSow(projectId, 1);

    const update = await addUpdate(projectId, 3, "Budget restated as €120k excluding media");
    const at = later();
    await setValue(projectId, "budget", { amount: "€120,000 excluding media (EUR)" }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: at });

    const result = await getSowChangeStatus(projectId);
    expect(result.status).toBe("changed_since_generation");
    expect(result.changes).toEqual([
      {
        versionLabel: "v3",
        date: at,
        source: "Client",
        fields: ["Budget"],
        summary: "Budget restated as €120k excluding media",
      },
    ]);
  });

  it("groups one update's changes to several attributes into a single entry, naming the sub-field when only part of an attribute changed", async () => {
    const projectId = await newProject("Two Fields");
    await setValue(projectId, "budget", { amount: "€110k" });
    await setValue(projectId, "timeline", { startDate: "2026-11-01", endDate: null, milestones: [] });
    await generateSow(projectId, 1);

    const update = await addUpdate(projectId, 2, null, "INTERNAL_TEAM");
    await setValue(projectId, "budget", { amount: "€130k" }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: later() });
    await setValue(projectId, "timeline", { startDate: "2026-11-01", endDate: "2027-01-15", milestones: [] }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: later() });

    const result = await getSowChangeStatus(projectId);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      versionLabel: "v2",
      source: "Internal team",
      fields: ["Budget", "Timeline and Key Milestones (end date)"],
      summary: "Budget, Timeline and Key Milestones (end date) updated",
    });
  });

  it("counts a PM edit of a material field, labelled as the PM's", async () => {
    const projectId = await newProject("PM Edit");
    await setValue(projectId, "scope", { description: "Web only" });
    await generateSow(projectId, 1);
    await setValue(projectId, "scope", { description: "Web and app" }, { source: "PM_ENTRY", kind: "CONFIRMED", createdAt: later() });

    const result = await getSowChangeStatus(projectId);
    expect(result.status).toBe("changed_since_generation");
    expect(result.changes[0]).toMatchObject({ versionLabel: "PM edit", source: "PM", fields: ["Scope"] });
  });

  it("is changed_since_generation after a confirmed capability change", async () => {
    const projectId = await newProject("Capabilities");
    await prisma.projectCapability.create({ data: { projectId, capability: "TECH_AND_DATA" } });
    await generateSow(projectId, 1);
    expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");

    await prisma.projectCapability.create({ data: { projectId, capability: "EXPERIENCE_DESIGN" } });

    const result = await getSowChangeStatus(projectId);
    expect(result.status).toBe("changed_since_generation");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ versionLabel: "Capabilities", fields: ["Capabilities"] });
    expect(result.changes[0].summary).toMatch(/added Experience Design/);
  });

  it("is changed_since_generation after a new version of the pinned estimate, and never stores a flag", async () => {
    const projectId = await newProject("Pinned Estimate");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    await generateSow(projectId, 1, v1);
    expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");

    await addEstimateVersion(prisma, { ...est, versionNumber: 2, total: 93000 });

    const result = await getSowChangeStatus(projectId);
    expect(result.status).toBe("changed_since_generation");
    expect(result.changes[0]).toMatchObject({ versionLabel: "Estimate v2", source: "Estimate", fields: ["Estimate"] });
    expect(result.changes[0].summary).toMatch(/Main is now 93,000 USD \(\+42,600 USD\); this SOW used v1/);
    expect(result.estimateSync?.status).toBe("stale");
  });

  it("another estimate's new version doesn't count", async () => {
    const projectId = await newProject("Other Estimate");
    const a = await createEstimate(prisma, { projectId, clientId, label: "A" });
    const b = await createEstimate(prisma, { projectId, clientId, label: "B" });
    const a1 = await addEstimateVersion(prisma, { ...a, versionNumber: 1, total: 100 });
    await addEstimateVersion(prisma, { ...b, versionNumber: 1, total: 200 });
    await generateSow(projectId, 1, a1, 100);

    await addEstimateVersion(prisma, { ...b, versionNumber: 2, total: 250 });

    expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
  });

  describe("stays up_to_date", () => {
    it("after an update that changes no material field", async () => {
      const projectId = await newProject("Non Material Update");
      await setValue(projectId, "budget", { amount: "€110k" });
      await generateSow(projectId, 1);

      await addUpdate(projectId, 2, "Client confirmed the kickoff call time");
      // The agent re-read the update and found the same budget: no new value.
      expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
    });

    it("after a client contact change", async () => {
      const projectId = await newProject("Contact Change");
      await setValue(projectId, "clientContact", { name: "Jamie", role: null, email: "j@example.com" });
      await generateSow(projectId, 1);

      const update = await addUpdate(projectId, 2, "New contact");
      await setValue(projectId, "clientContact", { name: "Sam", role: null, email: "s@example.com" }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: later() });

      expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
    });

    it("after a PM perspective edit", async () => {
      const projectId = await newProject("PM Perspective");
      await generateSow(projectId, 1);
      await prisma.pmPerspectiveEntry.create({ data: { projectId, fieldId: "proposedSolution", content: "Start with one partner." } });

      expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
    });

    it("when a material value changed and was put back", async () => {
      const projectId = await newProject("Reverted");
      await setValue(projectId, "budget", { amount: "€110k" });
      await generateSow(projectId, 1);

      const u2 = await addUpdate(projectId, 2, "Budget up");
      await setValue(projectId, "budget", { amount: "€150k" }, { source: "UPDATE", knowledgeItemId: u2.id, createdAt: later() });
      const u3 = await addUpdate(projectId, 3, "Budget back");
      await setValue(projectId, "budget", { amount: "€110k" }, { source: "UPDATE", knowledgeItemId: u3.id, createdAt: later() });

      expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
    });

    it("for a leftover retired PM-perspective suggestion row", async () => {
      const projectId = await newProject("Retired Rows");
      await setValue(projectId, "budget", { amount: "€110k" });
      await generateSow(projectId, 1);
      await setValue(projectId, "budget", { amount: "€999k" }, { source: "PM_ENTRY", kind: "SUGGESTION", createdAt: later() });

      expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");
    });
  });

  it("returns to up_to_date once a new SOW version is generated that includes the changes", async () => {
    const projectId = await newProject("Regenerated");
    await setValue(projectId, "budget", { amount: "€110k" });
    await generateSow(projectId, 1);
    const update = await addUpdate(projectId, 2, "Budget up");
    await setValue(projectId, "budget", { amount: "€150k" }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: new Date(Date.now() - 1000) });
    expect((await getSowChangeStatus(projectId)).status).toBe("changed_since_generation");

    await generateSow(projectId, 2);

    expect(await getSowChangeStatus(projectId)).toMatchObject({ status: "up_to_date", changes: [], sowVersionNumber: 2 });
  });

  it("gives an old SOW version with no snapshot no key-detail notice (never a false one), while still checking its estimate", async () => {
    const projectId = await newProject("No Snapshot");
    const est = await createEstimate(prisma, { projectId, clientId, label: "Main" });
    const v1 = await addEstimateVersion(prisma, { ...est, versionNumber: 1, total: 50400 });
    const sow = await prisma.sOW.create({ data: { projectId } });
    await prisma.sOWVersion.create({
      data: {
        sowId: sow.id,
        versionNumber: 1,
        fileName: "old.docx",
        fileBytes: Buffer.from("dummy"),
        content: {},
        sourceEstimateVersionId: v1,
        sourceEstimateTotal: 50400,
        sourceEstimateCurrency: "USD",
        sourceEstimateCapabilities: ["TECH_AND_DATA"],
      },
    });
    await setValue(projectId, "budget", { amount: "€1m" });
    await prisma.projectCapability.create({ data: { projectId, capability: "EXPERIENCE_DESIGN" } });

    expect((await getSowChangeStatus(projectId)).status).toBe("up_to_date");

    await addEstimateVersion(prisma, { ...est, versionNumber: 2, total: 60000 });
    const result = await getSowChangeStatus(projectId);
    expect(result.status).toBe("changed_since_generation");
    expect(result.changes.map((c) => c.versionLabel)).toEqual(["Estimate v2"]);
  });

  it("is scoped to the project: another project's changes never show", async () => {
    const mine = await newProject("Mine");
    const theirs = await newProject("Theirs");
    await setValue(mine, "budget", { amount: "€110k" });
    await setValue(theirs, "budget", { amount: "€110k" });
    await generateSow(mine, 1);
    const update = await addUpdate(theirs, 2, "Their budget changed");
    await setValue(theirs, "budget", { amount: "€500k" }, { source: "UPDATE", knowledgeItemId: update.id, createdAt: later() });

    expect((await getSowChangeStatus(mine)).status).toBe("up_to_date");
  });

  it("lists changes newest first", async () => {
    const projectId = await newProject("Ordering");
    await setValue(projectId, "budget", { amount: "€110k" });
    await setValue(projectId, "scope", { description: "Web" });
    await generateSow(projectId, 1);
    const u2 = await addUpdate(projectId, 2, "Budget up");
    const u3 = await addUpdate(projectId, 3, "Scope up");
    await setValue(projectId, "budget", { amount: "€150k" }, { source: "UPDATE", knowledgeItemId: u2.id, createdAt: later() });
    await setValue(projectId, "scope", { description: "Web and app" }, { source: "UPDATE", knowledgeItemId: u3.id, createdAt: later() });

    const result = await getSowChangeStatus(projectId);
    expect(result.changes.map((c) => c.versionLabel)).toEqual(["v3", "v2"]);
  });
});
