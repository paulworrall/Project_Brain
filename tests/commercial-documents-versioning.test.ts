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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_CommercialDocsVersioningSpec";

let hubId: string;
let clientAId: string;
let clientBId: string;
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

describe("RateCard versioning", () => {
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

  it("uploading a new version disables the previously current one", async () => {
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
    expect(versions.map((v) => v.status)).toEqual(["DISABLED", "ENABLED"]);
  });

  it("reverting re-enables the old version and disables the current one", async () => {
    const versions = await prisma.rateCardVersion.findMany({
      where: { rateCardId },
      orderBy: { versionNumber: "asc" },
    });
    const older = versions[0];

    await revertRateCardVersionAction(clientAId, rateCardId, older.id, undefined, new FormData());

    const afterRevert = await prisma.rateCardVersion.findMany({
      where: { rateCardId },
      orderBy: { versionNumber: "asc" },
    });
    expect(afterRevert.map((v) => v.status)).toEqual(["ENABLED", "DISABLED"]);
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

  it("uploading/reverting a variant's version works the same as Rate Cards/MSA", async () => {
    const variant = await prisma.sOWTemplate.findFirstOrThrow({
      where: { clientId: clientAId, name: "Client A Variant" },
    });

    await uploadSOWTemplateVersionAction(variant.id, undefined, fileFormData({}, "variant-a-v2.txt"));
    let versions = await prisma.sOWTemplateVersion.findMany({
      where: { sowTemplateId: variant.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((v) => v.status)).toEqual(["DISABLED", "ENABLED"]);

    await revertSOWTemplateVersionAction(variant.id, versions[0].id, undefined, new FormData());
    versions = await prisma.sOWTemplateVersion.findMany({
      where: { sowTemplateId: variant.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((v) => v.status)).toEqual(["ENABLED", "DISABLED"]);
  });
});

describe("startSowDevelopmentAction", () => {
  it("lets a PM (Delivery role) select the baseline or their project's own Client's variant — no role restriction, since this is a Project field write, not a document write", async () => {
    const baseline = await prisma.sOWTemplate.findFirstOrThrow({ where: { isBaseline: true } });

    const formData = new FormData();
    formData.set("sowTemplateId", baseline.id);
    const result = await startSowDevelopmentAction(projectAId, undefined, formData);

    expect(result?.message).toBeUndefined();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectAId } });
    expect(project.sowTemplateId).toBe(baseline.id);
  });

  it("rejects a different Client's variant, never trusting the submitted id alone", async () => {
    const clientBVariant = await prisma.sOWTemplate.findFirstOrThrow({
      where: { clientId: clientBId, name: "Client B Variant" },
    });

    const formData = new FormData();
    formData.set("sowTemplateId", clientBVariant.id);
    const result = await startSowDevelopmentAction(projectAId, undefined, formData);

    expect(result?.message).toMatch(/not valid for this client/i);
  });
});
