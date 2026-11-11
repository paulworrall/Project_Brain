import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB tests for FB-009 E (the short New Project form's server rules):
// Client first (Workstream automatic when there's one), MSA defaulting to the
// client's current one (and optional when there's none), a suggested name
// when blank (kept unique), PM defaulting to the current user, and the
// client defaults the form shows. The Intake Agent is mocked.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@/services/agents/intake-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/intake-agent")>();
  return {
    ...actual,
    runIntakeAgent: vi.fn(async () => ({
      classification: {
        briefType: "EMAIL",
        summary: "A brief.",
        suggestedProjectName: "Summer Launch",
        assessment: { level: "complete", reasons: [] },
      },
      scopeSummary: {
        context: "c",
        outOfScope: [],
        deliverables: [],
        constraints: [],
        assumptions: [],
        openQuestions: [],
      },
      clarificationEmail: { subject: "Hi", bodyText: "Hello" },
      checklist: { items: [{ label: "Assign job code", step: "brief" }] },
      keyAttributes: null,
      keyAttributesError: null,
    })),
  };
});

const { createProjectAction, getClientProjectDefaultsAction } =
  await import("@/app/(dashboard)/projects/new/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const STAMP = Date.now();

let hubId: string;
let noMsaClient: { id: string; workstreamId: string };
let msaClient: {
  id: string;
  workstreamId: string;
  msaId: string;
  rateCardId: string;
  versionId: string;
};
let twoWorkstreamClientId: string;
let otherMsaId: string;
let pm: { id: string; role: "DELIVERY" };
let ce: { id: string; role: "CLIENT_ENGAGEMENT" };

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("briefText", "A summer launch brief.");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function create(fields: Record<string, string>) {
  try {
    return {
      result: await createProjectAction(undefined, form(fields)),
      projectId: null as string | null,
    };
  } catch (error) {
    if (error instanceof Redirected)
      return { result: undefined, projectId: error.to.split("/").pop()! };
    throw error;
  }
}

async function msaFor(clientId: string) {
  return prisma.masterServiceAgreement.create({
    data: {
      clientId,
      versions: {
        create: {
          versionNumber: 1,
          fileName: "msa.txt",
          fileBytes: Buffer.from("msa"),
          extractedText: "msa",
          effectiveFrom: new Date("2026-01-01"),
          status: "ENABLED",
        },
      },
    },
  });
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: `TestHub_CreateDefaults_${STAMP}` } });
  hubId = hub.id;
  const [a, b, c, d] = await Promise.all([
    prisma.client.create({ data: { name: "DefaultsNoMsa", hubId } }),
    prisma.client.create({ data: { name: "DefaultsWithMsa", hubId } }),
    prisma.client.create({ data: { name: "DefaultsTwoWs", hubId } }),
    prisma.client.create({ data: { name: "DefaultsOther", hubId } }),
  ]);
  const wsA = await prisma.workstream.create({ data: { name: "A", clientId: a.id } });
  const wsB = await prisma.workstream.create({ data: { name: "B", clientId: b.id } });
  await prisma.workstream.create({ data: { name: "C1", clientId: c.id } });
  await prisma.workstream.create({ data: { name: "C2", clientId: c.id } });
  const msaB = await msaFor(b.id);
  otherMsaId = (await msaFor(d.id)).id;
  const rateCard = await prisma.rateCard.create({
    data: { clientId: b.id, name: "B rates", currency: "GBP" },
  });
  const v1 = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionNumber: 1,
      fileName: "r1.xlsx",
      fileBytes: Buffer.from("x"),
      extractedText: "x",
      effectiveFrom: new Date("2026-01-01"),
      status: "DISABLED",
    },
  });
  const v2 = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionNumber: 2,
      fileName: "r2.xlsx",
      fileBytes: Buffer.from("x"),
      extractedText: "x",
      effectiveFrom: new Date("2026-06-01"),
      status: "ENABLED",
    },
  });
  void v1;
  noMsaClient = { id: a.id, workstreamId: wsA.id };
  msaClient = {
    id: b.id,
    workstreamId: wsB.id,
    msaId: msaB.id,
    rateCardId: rateCard.id,
    versionId: v2.id,
  };
  twoWorkstreamClientId = c.id;
  const [u1, u2] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Pat PM",
        email: `pat-${STAMP}@defaults.test`,
        passwordHash: "x",
        role: "DELIVERY",
      },
    }),
    prisma.user.create({
      data: {
        name: "Cam CE",
        email: `cam-${STAMP}@defaults.test`,
        passwordHash: "x",
        role: "CLIENT_ENGAGEMENT",
      },
    }),
  ]);
  pm = { id: u1.id, role: "DELIVERY" };
  ce = { id: u2.id, role: "CLIENT_ENGAGEMENT" };
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.user.deleteMany({ where: { id: { in: [pm.id, ce.id] } } });
  await prisma.$disconnect();
});

beforeEach(() => mockAuth.mockResolvedValue({ user: pm }));

describe("createProjectAction — FB-009 E defaults", () => {
  it("needs only Client and Brief: workstream automatic, name suggested, PM = current user", async () => {
    const { projectId } = await create({ clientId: msaClient.id });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId! } });
    expect(project).toMatchObject({
      workstreamId: msaClient.workstreamId,
      name: "Summer Launch",
      projectManagerId: pm.id,
      masterServiceAgreementId: msaClient.msaId,
      briefAssessment: { level: "complete", reasons: [] },
    });
  });

  it("keeps a suggested name unique within the workstream", async () => {
    const { projectId } = await create({ clientId: msaClient.id });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).name).toBe(
      "Summer Launch (2)"
    );
  });

  it("uses a typed name and an explicit PM as given; no PM when the user can't be one", async () => {
    mockAuth.mockResolvedValue({ user: ce });
    const { projectId } = await create({ clientId: msaClient.id, name: "My Name" });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).toMatchObject({
      name: "My Name",
      projectManagerId: null,
    });
    const explicit = await create({
      clientId: msaClient.id,
      name: "With PM",
      projectManagerId: pm.id,
    });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: explicit.projectId! } }))
        .projectManagerId
    ).toBe(pm.id);
    const invalid = await create({ clientId: msaClient.id, projectManagerId: ce.id });
    expect(invalid.result?.errors?.projectManagerId?.[0]).toMatch(/project manager/);
  });

  it("creates a project for a client with no MSA (the readiness check shows it missing)", async () => {
    const { projectId } = await create({ clientId: noMsaClient.id });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId! } }))
        .masterServiceAgreementId
    ).toBeNull();
  });

  it("still rejects another client's MSA, or an unknown one", async () => {
    for (const masterServiceAgreementId of [otherMsaId, "not-a-real-id"]) {
      const { result, projectId } = await create({
        clientId: msaClient.id,
        masterServiceAgreementId,
      });
      expect(projectId).toBeNull();
      expect(result?.message).toMatch(/valid, active master service agreement/i);
    }
  });

  it("asks for a workstream when the client has several, and needs a client", async () => {
    expect(
      (await create({ clientId: twoWorkstreamClientId })).result?.errors?.workstreamId?.[0]
    ).toBe("Select a workstream.");
    expect((await create({})).result?.errors?.clientId?.[0]).toBe("Select a client.");
  });
});

describe("getClientProjectDefaultsAction", () => {
  it("returns the current MSA and the only rate card's current version as defaults", async () => {
    const defaults = await getClientProjectDefaultsAction(msaClient.id);
    expect(defaults.workstreams).toEqual([{ id: msaClient.workstreamId, name: "B" }]);
    expect(defaults.msa?.id).toBe(msaClient.msaId);
    expect(defaults.defaultRateCard).toEqual({
      rateCardId: msaClient.rateCardId,
      rateCardVersionId: msaClient.versionId,
    });
  });

  it("has no MSA or rate card default for a client without them", async () => {
    const defaults = await getClientProjectDefaultsAction(noMsaClient.id);
    expect(defaults).toMatchObject({ msa: null, rateCards: [], defaultRateCard: null });
  });
});
