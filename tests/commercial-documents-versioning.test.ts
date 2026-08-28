import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration tests for the generalized commercial-document
// versioning pattern shared by MSA/Rate Card/SOW Template: uploading a new
// version disables whichever was current; reverting re-enables an old
// version and disables the current one; a SOW Template selector never
// crosses Client boundaries. Only next/cache and @/lib/auth are mocked —
// everything else runs for real against a throwaway Hub, removed via
// cascade delete in afterAll (same convention as
// commercial-documents-permissions.test.ts).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth");
const mockAuth = auth as ReturnType<typeof vi.fn>;

const {
  uploadMasterServiceAgreementVersionAction,
  revertMasterServiceAgreementVersionAction,
  createRateCardAction,
  uploadRateCardVersionAction,
  revertRateCardVersionAction,
  archiveRateCardAction,
  unarchiveRateCardAction,
} = await import("@/app/(dashboard)/clients/[clientId]/actions");

const {
  getSOWTemplatesForClientAction,
  createClientSpecificSOWTemplateAction,
  uploadSOWTemplateVersionAction,
  revertSOWTemplateVersionAction,
} = await import("@/app/(dashboard)/sow-templates/actions");

const { startSowDevelopmentAction } = await import(
  "@/app/(dashboard)/projects/[projectId]/actions"
);

const { getRateCardsForWorkstreamAction } = await import("@/app/(dashboard)/projects/new/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_CommercialDocsVersioningSpec";

let hubId: string;
let clientAId: string;
let clientBId: string;
let workstreamAId: string;
let projectAId: string;
let clientEngagementUserId: string;

function fakeFile(name: string, text = "dummy file contents"): File {
  return new File([Buffer.from(text)], name, { type: "text/plain" });
}

// Always sets effectiveTo (even if blank) — a real <input type="date"> left
// empty still submits "" for its key, never omits it, and
// EffectiveDatesSchema's `.optional()` only accepts undefined, not the null
// formData.get() returns for a truly-absent key. SOWTemplate actions ignore
// these extra keys harmlessly (their schema doesn't reference them).
function fileFormData(extra: Record<string, string> = {}, fileName = "doc.txt"): FormData {
  const formData = new FormData();
  formData.set("effectiveTo", "");
  for (const [key, value] of Object.entries(extra)) {
    formData.set(key, value);
  }
  formData.set("file", fakeFile(fileName));
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { name: "VersioningSpecClientA", hubId } }),
    prisma.client.create({ data: { name: "VersioningSpecClientB", hubId } }),
  ]);
  clientAId = clientA.id;
  clientBId = clientB.id;

  const workstreamA = await prisma.workstream.create({
    data: { name: "VersioningSpecWorkstreamA", clientId: clientAId },
  });
  workstreamAId = workstreamA.id;
  const projectA = await prisma.project.create({
    data: { name: "Versioning Spec Project A", workstreamId: workstreamA.id },
  });
  projectAId = projectA.id;

  const clientEngagementUser = await prisma.user.create({
    data: {
      name: "Versioning Spec CE",
      email: "versioning-spec-ce@projectbrain.test",
      passwordHash: "unused-in-this-test",
      role: "CLIENT_ENGAGEMENT",
    },
  });
  clientEngagementUserId = clientEngagementUser.id;
  mockAuth.mockResolvedValue({ user: { id: clientEngagementUserId, role: "CLIENT_ENGAGEMENT" } });
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.user.delete({ where: { id: clientEngagementUserId } });
  await prisma.$disconnect();
});

describe("migration integrity — the current-version invariant holds database-wide", () => {
  it("never allows more than one ENABLED version per MasterServiceAgreement, RateCard, or SOWTemplate, including data carried over from before the versioning rework", async () => {
    const [msaViolations, rateCardViolations, sowTemplateViolations] = await Promise.all([
      prisma.masterServiceAgreementVersion.groupBy({
        by: ["masterServiceAgreementId"],
        where: { status: "ENABLED" },
        _count: { _all: true },
        having: { masterServiceAgreementId: { _count: { gt: 1 } } },
      }),
      prisma.rateCardVersion.groupBy({
        by: ["rateCardId"],
        where: { status: "ENABLED" },
        _count: { _all: true },
        having: { rateCardId: { _count: { gt: 1 } } },
      }),
      prisma.sOWTemplateVersion.groupBy({
        by: ["sowTemplateId"],
        where: { status: "ENABLED" },
        _count: { _all: true },
        having: { sowTemplateId: { _count: { gt: 1 } } },
      }),
    ]);

    expect(msaViolations).toHaveLength(0);
    expect(rateCardViolations).toHaveLength(0);
    expect(sowTemplateViolations).toHaveLength(0);
  });

  it("still has the one seeded GLOBAL baseline SOW Template, unaffected by this test file's Client-scoped variants", async () => {
    const baselines = await prisma.sOWTemplate.findMany({ where: { isBaseline: true } });
    expect(baselines).toHaveLength(1);
    expect(baselines[0].scope).toBe("GLOBAL");
    expect(baselines[0].clientId).toBeNull();
  });
});

describe("MasterServiceAgreement versioning", () => {
  it("uploading a new version disables the previously current one", async () => {
    await uploadMasterServiceAgreementVersionAction(
      clientAId,
      undefined,
      fileFormData({ effectiveFrom: "2026-01-01" }, "msa-v1.txt")
    );
    await uploadMasterServiceAgreementVersionAction(
      clientAId,
      undefined,
      fileFormData({ effectiveFrom: "2026-06-01" }, "msa-v2.txt")
    );

    const msa = await prisma.masterServiceAgreement.findUniqueOrThrow({
      where: { clientId: clientAId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(msa.versions.map((v) => v.status)).toEqual(["DISABLED", "ENABLED"]);
    expect(msa.versions[1].fileName).toBe("msa-v2.txt");
  });

  it("reverting re-enables the old version and disables the current one", async () => {
    const msa = await prisma.masterServiceAgreement.findUniqueOrThrow({
      where: { clientId: clientAId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    const [older, current] = msa.versions;

    await revertMasterServiceAgreementVersionAction(clientAId, older.id, undefined, new FormData());

    const afterRevert = await prisma.masterServiceAgreementVersion.findMany({
      where: { masterServiceAgreementId: msa.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(afterRevert.find((v) => v.id === older.id)?.status).toBe("ENABLED");
    expect(afterRevert.find((v) => v.id === current.id)?.status).toBe("DISABLED");
  });
});

describe("createRateCardAction — creation always includes a first version (feature: rate-card-page-creation-and-toggle)", () => {
  it("rejects a submission with no file, creating no RateCard row at all — there is no way to reach a zero-version Rate Card", async () => {
    const before = await prisma.rateCard.count({ where: { clientId: clientAId } });

    const formData = new FormData();
    formData.set("name", "No File Rates");
    formData.set("currency", "GBP");
    formData.set("effectiveFrom", "2026-01-01");
    formData.set("effectiveTo", "");
    // Deliberately no "file" entry set.

    const result = await createRateCardAction(clientAId, undefined, formData);

    expect(result?.message).toMatch(/upload the rate card file/i);
    const after = await prisma.rateCard.count({ where: { clientId: clientAId } });
    expect(after).toBe(before);
    const found = await prisma.rateCard.findFirst({ where: { clientId: clientAId, name: "No File Rates" } });
    expect(found).toBeNull();
  });
});

describe("RateCard versioning (phase 2: versions no longer supersede — Rule 3 audit gap fix)", () => {
  let rateCardId: string;

  beforeEach(async () => {
    if (!rateCardId) {
      await createRateCardAction(
        clientAId,
        undefined,
        fileFormData(
          { name: "Versioning Spec Rates", currency: "GBP", effectiveFrom: "2026-01-01" },
          "rates-v1.txt"
        )
      );
      const rateCard = await prisma.rateCard.findFirstOrThrow({
        where: { clientId: clientAId, name: "Versioning Spec Rates" },
      });
      rateCardId = rateCard.id;
    }
  });

  it("uploading a new version does NOT disable the previous one — the new version is created DISABLED, the old one is left untouched", async () => {
    await uploadRateCardVersionAction(
      clientAId,
      rateCardId,
      undefined,
      fileFormData({ effectiveFrom: "2026-06-01" }, "rates-v2.txt")
    );

    const versions = await prisma.rateCardVersion.findMany({
      where: { rateCardId },
      orderBy: { versionNumber: "asc" },
    });
    // v1 (created ENABLED by createRateCardAction) stays ENABLED; v2 is
    // inserted DISABLED, not auto-promoted — status is no longer an
    // exclusivity/selectability gate for this table (see
    // uploadRateCardVersionAction's comment). Both remain fetchable.
    expect(versions.map((v) => v.status)).toEqual(["ENABLED", "DISABLED"]);
  });

  it("both versions remain independently selectable via getRateCardsForWorkstreamAction after two uploads", async () => {
    await uploadRateCardVersionAction(
      clientAId,
      rateCardId,
      undefined,
      fileFormData({ effectiveFrom: "2026-09-01" }, "rates-v3.txt")
    );

    const options = await getRateCardsForWorkstreamAction(workstreamAId);
    const rateCard = options.find((rc) => rc.id === rateCardId);
    expect(rateCard).toBeDefined();
    // v1, v2 (from the previous test), v3 — all present, newest first.
    expect(rateCard!.versions.map((v) => v.fileName)).toEqual([
      "rates-v3.txt",
      "rates-v2.txt",
      "rates-v1.txt",
    ]);
  });

  it("reverting flags a specific version as ENABLED (the display default) and disables whichever was flagged before — every version stays selectable regardless", async () => {
    const versions = await prisma.rateCardVersion.findMany({
      where: { rateCardId },
      orderBy: { versionNumber: "asc" },
    });
    const target = versions[1]; // v2 — currently DISABLED, not the flagged default.

    await revertRateCardVersionAction(clientAId, rateCardId, target.id, undefined, new FormData());

    const afterRevert = await prisma.rateCardVersion.findMany({
      where: { rateCardId },
      orderBy: { versionNumber: "asc" },
    });
    expect(afterRevert.find((v) => v.id === target.id)?.status).toBe("ENABLED");
    expect(afterRevert.filter((v) => v.status === "ENABLED")).toHaveLength(1);

    // The flag change doesn't remove anything from the selector.
    const options = await getRateCardsForWorkstreamAction(workstreamAId);
    const rateCard = options.find((rc) => rc.id === rateCardId);
    expect(rateCard!.versions).toHaveLength(3);
  });
});

describe("RateCard archiving (phase 2: a distinct lever from version status — Rule 3 audit gap fix)", () => {
  let archivableRateCardId: string;

  beforeAll(async () => {
    await createRateCardAction(
      clientAId,
      undefined,
      fileFormData(
        { name: "Archivable Rates", currency: "GBP", effectiveFrom: "2026-01-01" },
        "archivable-v1.txt"
      )
    );
    const rateCard = await prisma.rateCard.findFirstOrThrow({
      where: { clientId: clientAId, name: "Archivable Rates" },
    });
    archivableRateCardId = rateCard.id;
  });

  it("archiving hides the Rate Card from getRateCardsForWorkstreamAction but leaves the row and its versions in the database", async () => {
    const beforeArchive = await getRateCardsForWorkstreamAction(workstreamAId);
    expect(beforeArchive.some((rc) => rc.id === archivableRateCardId)).toBe(true);

    const result = await archiveRateCardAction(clientAId, archivableRateCardId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const afterArchive = await getRateCardsForWorkstreamAction(workstreamAId);
    expect(afterArchive.some((rc) => rc.id === archivableRateCardId)).toBe(false);

    const stillInDb = await prisma.rateCard.findUniqueOrThrow({
      where: { id: archivableRateCardId },
      include: { versions: true },
    });
    expect(stillInDb.archivedAt).not.toBeNull();
    expect(stillInDb.versions).toHaveLength(1);
  });

  it("unarchiving restores it to the lookup", async () => {
    const result = await unarchiveRateCardAction(clientAId, archivableRateCardId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const rateCard = await prisma.rateCard.findUniqueOrThrow({ where: { id: archivableRateCardId } });
    expect(rateCard.archivedAt).toBeNull();

    const options = await getRateCardsForWorkstreamAction(workstreamAId);
    expect(options.some((rc) => rc.id === archivableRateCardId)).toBe(true);
  });
});

describe("SOW Template client isolation", () => {
  it("a Client's SOW Template selector never includes a different Client's variant, only the baseline plus its own", async () => {
    await createClientSpecificSOWTemplateAction(
      clientAId,
      undefined,
      fileFormData({ name: "Client A Variant" }, "variant-a.txt")
    );
    await createClientSpecificSOWTemplateAction(
      clientBId,
      undefined,
      fileFormData({ name: "Client B Variant" }, "variant-b.txt")
    );

    const optionsForA = await getSOWTemplatesForClientAction(clientAId);

    expect(optionsForA.some((t) => t.name === "Client A Variant")).toBe(true);
    expect(optionsForA.some((t) => t.isBaseline)).toBe(true);
    expect(optionsForA.some((t) => t.name === "Client B Variant")).toBe(false);
  });

  it("uploading a new version does NOT disable the previous one (phase 2: Rule 2 audit gap fix) — reverting still works as a display-default flag", async () => {
    const variant = await prisma.sOWTemplate.findFirstOrThrow({
      where: { clientId: clientAId, name: "Client A Variant" },
    });

    await uploadSOWTemplateVersionAction(variant.id, undefined, fileFormData({}, "variant-a-v2.txt"));
    let versions = await prisma.sOWTemplateVersion.findMany({
      where: { sowTemplateId: variant.id },
      orderBy: { versionNumber: "asc" },
    });
    // v1 stays ENABLED (untouched by upload); v2 is inserted DISABLED, not
    // auto-promoted — same repurposing as RateCardVersion. Both remain
    // fetchable regardless of this flag.
    expect(versions.map((v) => v.status)).toEqual(["ENABLED", "DISABLED"]);

    const optionsBeforeRevert = await getSOWTemplatesForClientAction(clientAId);
    const templateBeforeRevert = optionsBeforeRevert.find((t) => t.id === variant.id);
    expect(templateBeforeRevert!.versions.map((v) => v.fileName)).toEqual([
      "variant-a-v2.txt",
      "variant-a.txt",
    ]);

    await revertSOWTemplateVersionAction(variant.id, versions[1].id, undefined, new FormData());
    versions = await prisma.sOWTemplateVersion.findMany({
      where: { sowTemplateId: variant.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((v) => v.status)).toEqual(["DISABLED", "ENABLED"]);

    // The flag change doesn't remove anything from the selector.
    const optionsAfterRevert = await getSOWTemplatesForClientAction(clientAId);
    const templateAfterRevert = optionsAfterRevert.find((t) => t.id === variant.id);
    expect(templateAfterRevert!.versions).toHaveLength(2);
  });
});

describe("startSowDevelopmentAction", () => {
  it("lets a PM (Delivery role) select the baseline or their project's own Client's variant — no role restriction, since this is a Project field write, not a document write", async () => {
    const baseline = await prisma.sOWTemplate.findFirstOrThrow({
      where: { isBaseline: true },
      include: { versions: { take: 1 } },
    });

    const formData = new FormData();
    formData.set("sowTemplateId", baseline.id);
    formData.set("sowTemplateVersionId", baseline.versions[0].id);
    const result = await startSowDevelopmentAction(projectAId, undefined, formData);

    expect(result?.message).toBeUndefined();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectAId } });
    expect(project.sowTemplateId).toBe(baseline.id);
    expect(project.sowTemplateVersionId).toBe(baseline.versions[0].id);
  });

  it("rejects a different Client's variant, never trusting the submitted id alone", async () => {
    const clientBVariant = await prisma.sOWTemplate.findFirstOrThrow({
      where: { clientId: clientBId, name: "Client B Variant" },
      include: { versions: { take: 1 } },
    });

    const formData = new FormData();
    formData.set("sowTemplateId", clientBVariant.id);
    formData.set("sowTemplateVersionId", clientBVariant.versions[0].id);
    const result = await startSowDevelopmentAction(projectAId, undefined, formData);

    expect(result?.message).toMatch(/not valid for this client/i);
  });

  it("rejects a version that doesn't belong to the selected template, never trusting the submitted id alone", async () => {
    const baseline = await prisma.sOWTemplate.findFirstOrThrow({ where: { isBaseline: true } });
    const clientAVariant = await prisma.sOWTemplate.findFirstOrThrow({
      where: { clientId: clientAId, name: "Client A Variant" },
      include: { versions: { take: 1 } },
    });

    const formData = new FormData();
    formData.set("sowTemplateId", baseline.id);
    formData.set("sowTemplateVersionId", clientAVariant.versions[0].id);
    const result = await startSowDevelopmentAction(projectAId, undefined, formData);

    expect(result?.message).toMatch(/select a version/i);
  });
});
