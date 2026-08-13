import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// First real role-enforcement in the app (CLAUDE.md: both roles previously
// saw identical views). Calls the REAL Server Actions against the real dev
// database — not a re-implementation of their permission logic — with only
// next/cache and @/lib/auth mocked as framework/session boundaries, matching
// this codebase's existing convention (see stage-1-5-happy-path.test.ts).
// Everything created under one throwaway Hub, removed via cascade delete.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth");
const mockAuth = auth as ReturnType<typeof vi.fn>;

const {
  createMasterServiceAgreementAction,
  createRateCardAction,
  archiveRateCardAction,
} = await import("@/app/(dashboard)/clients/[clientId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_CommercialDocsPermissionsSpec";

let hubId: string;
let clientId: string;
let clientEngagementUserId: string;
let deliveryUserId: string;

function asClientEngagement() {
  mockAuth.mockResolvedValue({
    user: { id: clientEngagementUserId, role: "CLIENT_ENGAGEMENT" },
  });
}

function asDelivery() {
  mockAuth.mockResolvedValue({ user: { id: deliveryUserId, role: "DELIVERY" } });
}

function fakeFile(name: string, text = "dummy file contents"): File {
  return new File([Buffer.from(text)], name, { type: "text/plain" });
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;

  const client = await prisma.client.create({
    data: { name: "PermissionsSpecClient", hubId },
  });
  clientId = client.id;

  const [clientEngagementUser, deliveryUser] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Permissions Spec CE",
        email: "permissions-spec-ce@projectbrain.test",
        passwordHash: "unused-in-this-test",
        role: "CLIENT_ENGAGEMENT",
      },
    }),
    prisma.user.create({
      data: {
        name: "Permissions Spec Delivery",
        email: "permissions-spec-delivery@projectbrain.test",
        passwordHash: "unused-in-this-test",
        role: "DELIVERY",
      },
    }),
  ]);
  clientEngagementUserId = clientEngagementUser.id;
  deliveryUserId = deliveryUser.id;
});

afterEach(() => {
  mockAuth.mockReset();
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.user.deleteMany({
    where: { id: { in: [clientEngagementUserId, deliveryUserId] } },
  });
  await prisma.$disconnect();
});

// FormData.get() returns null for a truly absent key, but z.string().optional()
// only accepts undefined — a real <input type="date"> always submits "" when
// left empty, never an absent key, so always set the key (possibly to "") to
// match real form-submission semantics rather than triggering a spurious
// validation failure on a field these tests don't care about.
function msaFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.set("effectiveFrom", overrides.effectiveFrom ?? "2026-01-01");
  formData.set("effectiveTo", overrides.effectiveTo ?? "");
  formData.set("file", fakeFile("msa.txt", overrides.effectiveFrom ?? "v1"));
  return formData;
}

function rateCardFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "2026 Standard Rates");
  formData.set("currency", overrides.currency ?? "GBP");
  formData.set("effectiveFrom", overrides.effectiveFrom ?? "2026-01-01");
  formData.set("effectiveTo", overrides.effectiveTo ?? "");
  formData.set("file", fakeFile("rates.txt"));
  return formData;
}

describe("Master Service Agreement permissions", () => {
  it("lets a ClientEngagement user upload the first MSA", async () => {
    asClientEngagement();

    const result = await createMasterServiceAgreementAction(clientId, undefined, msaFormData());
    expect(result?.message).toBeUndefined();

    const msas = await prisma.masterServiceAgreement.findMany({ where: { clientId } });
    expect(msas).toHaveLength(1);
    expect(msas[0].status).toBe("ACTIVE");
    expect(msas[0].uploadedById).toBe(clientEngagementUserId);
  });

  it("lets a ClientEngagement user replace the MSA, superseding the previous Active one", async () => {
    asClientEngagement();

    await createMasterServiceAgreementAction(clientId, undefined, msaFormData({ effectiveFrom: "2026-06-01" }));

    const msas = await prisma.masterServiceAgreement.findMany({
      where: { clientId },
      orderBy: { uploadedAt: "asc" },
    });
    expect(msas).toHaveLength(2);
    expect(msas[0].status).toBe("SUPERSEDED");
    expect(msas[1].status).toBe("ACTIVE");
  });

  it("rejects a Delivery user attempting to upload/replace an MSA, and creates no row", async () => {
    asDelivery();

    const before = await prisma.masterServiceAgreement.count({ where: { clientId } });
    const result = await createMasterServiceAgreementAction(clientId, undefined, msaFormData());
    const after = await prisma.masterServiceAgreement.count({ where: { clientId } });

    expect(result?.message).toMatch(/Client Engagement/i);
    expect(after).toBe(before);
  });
});

describe("Rate Card permissions", () => {
  it("lets a ClientEngagement user create a Rate Card", async () => {
    asClientEngagement();

    const result = await createRateCardAction(clientId, undefined, rateCardFormData());
    expect(result?.message).toBeUndefined();

    const rateCards = await prisma.rateCard.findMany({ where: { clientId } });
    expect(rateCards).toHaveLength(1);
    expect(rateCards[0].status).toBe("ACTIVE");
    expect(rateCards[0].currency).toBe("GBP");
  });

  it("rejects a Delivery user attempting to create a Rate Card, and creates no row", async () => {
    asDelivery();

    const before = await prisma.rateCard.count({ where: { clientId } });
    const result = await createRateCardAction(clientId, undefined, rateCardFormData({ name: "Sneaky Rates" }));
    const after = await prisma.rateCard.count({ where: { clientId } });

    expect(result?.message).toMatch(/Client Engagement/i);
    expect(after).toBe(before);
  });

  it("lets a ClientEngagement user archive a Rate Card", async () => {
    asClientEngagement();
    const rateCard = await prisma.rateCard.findFirstOrThrow({ where: { clientId } });

    const result = await archiveRateCardAction(clientId, rateCard.id, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const updated = await prisma.rateCard.findUniqueOrThrow({ where: { id: rateCard.id } });
    expect(updated.status).toBe("ARCHIVED");
  });

  it("rejects a Delivery user attempting to archive a Rate Card, leaving its status unchanged", async () => {
    asClientEngagement();
    await createRateCardAction(clientId, undefined, rateCardFormData({ name: "Still Active Rates" }));
    const rateCard = await prisma.rateCard.findFirstOrThrow({
      where: { clientId, status: "ACTIVE" },
    });

    asDelivery();
    const result = await archiveRateCardAction(clientId, rateCard.id, undefined, new FormData());

    expect(result?.message).toMatch(/Client Engagement/i);
    const unchanged = await prisma.rateCard.findUniqueOrThrow({ where: { id: rateCard.id } });
    expect(unchanged.status).toBe("ACTIVE");
  });
});
