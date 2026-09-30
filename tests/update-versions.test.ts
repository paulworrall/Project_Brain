import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB tests for update versioning: the backfill that numbers existing
// updates, the version history (brief = v1), and immutability.

const { assignMissingUpdateVersions, getVersionHistory } = await import("@/lib/updateVersions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_UpdateVersionsSpec";

let hubId: string;
let workstreamId: string;

async function newProject(name: string, brief: { createdAt?: Date; fileName?: string } = {}) {
  return prisma.project.create({
    data: {
      name,
      workstreamId,
      briefRawText: "The original brief.",
      briefFileName: brief.fileName ?? null,
      ...(brief.createdAt ? { createdAt: brief.createdAt } : {}),
    },
  });
}

async function legacyUpdate(projectId: string, content: string, uploadedAt: Date, title: string | null = "Old title") {
  return prisma.knowledgeItem.create({
    data: { projectId, type: "NOTE", title, content, uploadedAt },
  });
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "VersionsSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "VersionsSpecWorkstream", clientId: client.id },
  });
  workstreamId = workstream.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("assignMissingUpdateVersions (the migration backfill)", () => {
  it("numbers existing updates v2 onwards by when they were added, source Client, per project", async () => {
    const a = await newProject("Backfill A");
    const b = await newProject("Backfill B");
    // Created out of order on purpose.
    const third = await legacyUpdate(a.id, "third", new Date("2026-09-20T10:00:00Z"));
    const first = await legacyUpdate(a.id, "first", new Date("2026-09-01T10:00:00Z"));
    const second = await legacyUpdate(a.id, "second", new Date("2026-09-10T10:00:00Z"));
    const onlyB = await legacyUpdate(b.id, "only in B", new Date("2026-09-05T10:00:00Z"));

    // Scoped to this spec's projects — the unscoped run (every project) is
    // the one-off backfill script, never run from tests against real data.
    await assignMissingUpdateVersions(prisma, a.id);
    await assignMissingUpdateVersions(prisma, b.id);

    const versionOf = async (id: string) =>
      (await prisma.knowledgeItem.findUniqueOrThrow({ where: { id } })).versionNumber;
    expect(await versionOf(first.id)).toBe(2);
    expect(await versionOf(second.id)).toBe(3);
    expect(await versionOf(third.id)).toBe(4);
    expect(await versionOf(onlyB.id)).toBe(2);
    const sources = await prisma.knowledgeItem.findMany({ where: { projectId: a.id }, select: { source: true } });
    expect(sources.every((s) => s.source === "CLIENT")).toBe(true);
  });

  it("is safe to run again, and continues after the highest existing version", async () => {
    const project = await newProject("Backfill Rerun");
    await legacyUpdate(project.id, "first", new Date("2026-09-01T10:00:00Z"));
    await assignMissingUpdateVersions(prisma, project.id);
    await assignMissingUpdateVersions(prisma, project.id);
    const late = await legacyUpdate(project.id, "added before the deploy", new Date("2026-09-02T10:00:00Z"));
    await assignMissingUpdateVersions(prisma, project.id);

    const items = await prisma.knowledgeItem.findMany({
      where: { projectId: project.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(items.map((i) => [i.content, i.versionNumber])).toEqual([
      ["first", 2],
      ["added before the deploy", 3],
    ]);
    expect(items.find((i) => i.id === late.id)?.title).toBe("Old title");
  });
});

describe("getVersionHistory", () => {
  it("starts with the original brief as v1 'Initial brief', then each update in version order", async () => {
    const project = await newProject("History Project", {
      createdAt: new Date("2026-08-01T09:00:00Z"),
      fileName: "brief.pdf",
    });
    await legacyUpdate(project.id, "first", new Date("2026-09-01T10:00:00Z"), null);
    await legacyUpdate(project.id, "second", new Date("2026-09-02T10:00:00Z"), "PM allocation");
    await assignMissingUpdateVersions(prisma, project.id);
    await prisma.knowledgeItem.updateMany({
      where: { projectId: project.id, content: "second" },
      data: { changeSummary: "PM allocated." },
    });

    const history = await getVersionHistory(project.id);

    expect(history.map((v) => [v.versionNumber, v.label, v.source])).toEqual([
      [1, "Initial brief", "CLIENT"],
      [2, "Update — 1 Sept 2026, 11:00 (Note)", "CLIENT"],
      [3, "PM allocation (Note)", "CLIENT"],
    ]);
    expect(history[0].createdAt).toEqual(new Date("2026-08-01T09:00:00Z"));
    expect(history[0].detail).toBe("brief.pdf");
    expect(history[2].changeSummary).toBe("PM allocated.");
  });
});

describe("immutability", () => {
  it("refuses to change a saved update's content, source or version — corrections are a new update", async () => {
    const project = await newProject("Immutable Project");
    const item = await legacyUpdate(project.id, "as saved", new Date("2026-09-01T10:00:00Z"));
    await assignMissingUpdateVersions(prisma, project.id);

    await expect(
      prisma.knowledgeItem.update({ where: { id: item.id }, data: { content: "edited" } })
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.knowledgeItem.update({ where: { id: item.id }, data: { source: "INTERNAL_TEAM" } })
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.knowledgeItem.update({ where: { id: item.id }, data: { versionNumber: 9 } })
    ).rejects.toThrow(/immutable/i);

    const unchanged = await prisma.knowledgeItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(unchanged.content).toBe("as saved");
    expect(unchanged.versionNumber).toBe(2);
  });

  it("still lets the after-save AI summaries be added", async () => {
    const project = await newProject("Summaries Allowed Project");
    const item = await legacyUpdate(project.id, "content", new Date("2026-09-01T10:00:00Z"));
    await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: { summary: "One line.", changeSummary: "Budget increased." },
    });
    const saved = await prisma.knowledgeItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.summary).toBe("One line.");
    expect(saved.changeSummary).toBe("Budget increased.");
  });
});
