import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { cleanupTxtRateCards, formatCleanupReport } from "@/lib/txtRateCardCleanup";

// Real-DB tests for the one-off .txt rate card cleanup (FB-001). Every call is
// scoped to this spec's own throwaway clients via options.clientIds, so the
// delete-mode tests can never touch real rows in the shared database.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_TxtRateCardCleanupSpec";

let hubId: string;
let soloClientId: string;
let mixedClientId: string;
let clientIds: string[];
let blockedVersionId: string;
let blockedProjectId: string;
let unreferencedVersionIds: string[];

function version(versionNumber: number, fileName: string, status: "ENABLED" | "DISABLED") {
  return {
    versionNumber,
    fileName,
    fileBytes: Buffer.from(`bytes of ${fileName}`),
    extractedText: "text",
    effectiveFrom: new Date("2026-01-01"),
    status,
  };
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const [solo, mixed] = await Promise.all([
    prisma.client.create({ data: { name: "CleanupSpecSolo", hubId } }),
    prisma.client.create({ data: { name: "CleanupSpecMixed", hubId } }),
  ]);
  soloClientId = solo.id;
  mixedClientId = mixed.id;
  clientIds = [soloClientId, mixedClientId];

  // Solo: a single card whose only version is an unreferenced .txt.
  await prisma.rateCard.create({
    data: { clientId: soloClientId, name: "Txt Only", versions: { create: version(1, "RateCard_2026.txt", "ENABLED") } },
  });

  // Mixed: (B) .txt v1 + .xlsx v2, (C) .txt v1 referenced by a Project,
  // (D) two unreferenced .txt versions.
  const cardB = await prisma.rateCard.create({
    data: {
      clientId: mixedClientId,
      name: "Txt Then Xlsx",
      versions: { create: [version(1, "old.txt", "ENABLED"), version(2, "new.xlsx", "DISABLED")] },
    },
    include: { versions: true },
  });
  const cardC = await prisma.rateCard.create({
    data: { clientId: mixedClientId, name: "Referenced", versions: { create: version(1, "used.txt", "ENABLED") } },
    include: { versions: true },
  });
  const cardD = await prisma.rateCard.create({
    data: {
      clientId: mixedClientId,
      name: "Two Txt",
      versions: { create: [version(1, "a.txt", "ENABLED"), version(2, "b.TXT", "DISABLED")] },
    },
    include: { versions: true },
  });
  const soloCard = await prisma.rateCard.findFirstOrThrow({
    where: { clientId: soloClientId },
    include: { versions: true },
  });

  blockedVersionId = cardC.versions[0].id;
  unreferencedVersionIds = [
    soloCard.versions[0].id,
    cardB.versions.find((v) => v.versionNumber === 1)!.id,
    ...cardD.versions.map((v) => v.id),
  ];

  const workstream = await prisma.workstream.create({ data: { name: "CleanupSpecWs", clientId: mixedClientId } });
  const project = await prisma.project.create({
    data: {
      name: "Cleanup Spec Project",
      workstreamId: workstream.id,
      rateCardId: cardC.id,
      rateCardVersionId: blockedVersionId,
    },
  });
  blockedProjectId = project.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("cleanupTxtRateCards", () => {
  it("dry run lists exactly what it would delete and changes nothing", async () => {
    const before = await prisma.rateCardVersion.count({ where: { rateCard: { clientId: { in: clientIds } } } });

    const report = await cleanupTxtRateCards(prisma, false, { clientIds });

    expect(report.applied).toBe(false);
    expect(report.versions).toHaveLength(5);
    const outcomes = Object.fromEntries(report.versions.map((v) => [v.fileName, v.outcome]));
    expect(outcomes).toEqual({
      "RateCard_2026.txt": "WOULD_DELETE",
      "old.txt": "WOULD_DELETE",
      "used.txt": "BLOCKED",
      "a.txt": "WOULD_DELETE",
      "b.TXT": "WOULD_DELETE",
    });
    expect(report.removedRateCards.map((r) => r.rateCardName).sort()).toEqual(["Two Txt", "Txt Only"]);
    expect(report.removedRateCards.every((r) => r.outcome === "WOULD_DELETE")).toBe(true);
    expect(report.clientsWithNoRateCard).toEqual(["CleanupSpecSolo"]);
    expect(formatCleanupReport(report)).toContain("DRY RUN");

    expect(await prisma.rateCardVersion.count({ where: { rateCard: { clientId: { in: clientIds } } } })).toBe(before);
    expect(await prisma.rateCard.count({ where: { clientId: { in: clientIds } } })).toBe(4);
  });

  it("reports the blocked version with what references it, its default status and whether it is the only version", async () => {
    const report = await cleanupTxtRateCards(prisma, false, { clientIds });
    const blocked = report.versions.find((v) => v.versionId === blockedVersionId)!;

    expect(blocked).toMatchObject({
      clientName: "CleanupSpecMixed",
      rateCardName: "Referenced",
      isDefault: true,
      onlyVersionOnCard: true,
      outcome: "BLOCKED",
      blockedBy: ["1 project"],
    });
  });

  it("delete mode removes only unreferenced .txt versions (and their files), blocks referenced ones, and removes emptied rate cards", async () => {
    const report = await prisma.$transaction((tx) => cleanupTxtRateCards(tx, true, { clientIds }));

    expect(report.applied).toBe(true);
    expect(report.versions.filter((v) => v.outcome === "DELETED")).toHaveLength(4);
    expect(report.versions.filter((v) => v.outcome === "BLOCKED").map((v) => v.versionId)).toEqual([blockedVersionId]);

    // Unreferenced .txt versions are gone, along with their stored bytes.
    expect(await prisma.rateCardVersion.count({ where: { id: { in: unreferencedVersionIds } } })).toBe(0);

    // The referenced one — and the Project's reference to it — is untouched.
    const blocked = await prisma.rateCardVersion.findUnique({ where: { id: blockedVersionId } });
    expect(blocked?.fileName).toBe("used.txt");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: blockedProjectId } });
    expect(project.rateCardVersionId).toBe(blockedVersionId);
    expect(project.rateCardId).not.toBeNull();

    // The .xlsx version on the mixed card survives, so that card stays.
    const remainingCards = await prisma.rateCard.findMany({
      where: { clientId: { in: clientIds } },
      include: { versions: true },
      orderBy: { name: "asc" },
    });
    expect(remainingCards.map((c) => [c.name, c.versions.map((v) => v.fileName)])).toEqual([
      ["Referenced", ["used.txt"]],
      ["Txt Then Xlsx", ["new.xlsx"]],
    ]);

    expect(report.removedRateCards.map((r) => [r.rateCardName, r.outcome]).sort()).toEqual([
      ["Two Txt", "DELETED"],
      ["Txt Only", "DELETED"],
    ]);
    expect(report.clientsWithNoRateCard).toEqual(["CleanupSpecSolo"]);
  });

  it("is safe to re-run: with only the blocked version left it deletes nothing further", async () => {
    const report = await prisma.$transaction((tx) => cleanupTxtRateCards(tx, true, { clientIds }));

    expect(report.versions.map((v) => v.outcome)).toEqual(["BLOCKED"]);
    expect(report.removedRateCards).toEqual([]);
    expect(await prisma.rateCardVersion.findUnique({ where: { id: blockedVersionId } })).not.toBeNull();
  });
});
