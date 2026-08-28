import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Phase 2 (audit Rule 1 gap fix): createProjectAction now requires a
// masterServiceAgreementId belonging to the Project's own Client, with a
// currently-ENABLED version. These tests exercise only the rejection paths
// — every case here is expected to return an error before the Anthropic
// intake agent would ever be called, so (unlike stage-1-5-happy-path.test.ts)
// there's nothing to mock there; a call reaching the agent unexpectedly
// would throw on the unmocked import and fail the test loudly.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("UNEXPECTED_REDIRECT — MSA validation should have rejected before this");
  }),
}));

const { createProjectAction } = await import("@/app/(dashboard)/projects/new/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_CreateProjectMsaRequirementSpec";

let hubId: string;
let workstreamAId: string;
let msaBId: string;

function briefFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.set("workstreamId", overrides.workstreamId ?? workstreamAId);
  formData.set("name", overrides.name ?? "MSA Requirement Spec Project");
  formData.set("briefText", "Irrelevant brief text — validation should reject before this is read.");
  if (overrides.masterServiceAgreementId !== undefined) {
    formData.set("masterServiceAgreementId", overrides.masterServiceAgreementId);
  }
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { name: "MsaReqSpecClientA", hubId } }),
    prisma.client.create({ data: { name: "MsaReqSpecClientB", hubId } }),
  ]);

  const workstreamA = await prisma.workstream.create({
    data: { name: "MsaReqSpecWorkstreamA", clientId: clientA.id },
  });
  workstreamAId = workstreamA.id;

  // Client A intentionally has NO MSA at all, exercising the "missing"
  // rejection path realistically (not just an empty form field).
  // Client B has a real, ENABLED MSA — used to prove cross-client rejection.
  const msaB = await prisma.masterServiceAgreement.create({
    data: {
      clientId: clientB.id,
      versions: {
        create: {
          versionNumber: 1,
          fileName: "msa-b.txt",
          fileBytes: Buffer.from("dummy msa b contents"),
          extractedText: "dummy msa b contents",
          effectiveFrom: new Date("2026-01-01"),
          status: "ENABLED",
        },
      },
    },
  });
  msaBId = msaB.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("createProjectAction — required Master Service Agreement (phase 2: Rule 1 audit gap fix)", () => {
  it("rejects with a clear error when masterServiceAgreementId is missing, creating no project", async () => {
    const before = await prisma.project.count({ where: { workstreamId: workstreamAId } });

    const result = await createProjectAction(undefined, briefFormData());

    expect(result?.errors?.masterServiceAgreementId?.[0]).toMatch(
      /select the client's master service agreement/i
    );
    const after = await prisma.project.count({ where: { workstreamId: workstreamAId } });
    expect(after).toBe(before);
  });

  it("rejects with a clear error when masterServiceAgreementId belongs to a different Client, creating no project", async () => {
    const before = await prisma.project.count({ where: { workstreamId: workstreamAId } });

    const result = await createProjectAction(
      undefined,
      briefFormData({ masterServiceAgreementId: msaBId })
    );

    expect(result?.message).toMatch(/valid, active master service agreement/i);
    const after = await prisma.project.count({ where: { workstreamId: workstreamAId } });
    expect(after).toBe(before);
  });

  it("rejects an unknown/garbage masterServiceAgreementId, creating no project", async () => {
    const before = await prisma.project.count({ where: { workstreamId: workstreamAId } });

    const result = await createProjectAction(
      undefined,
      briefFormData({ masterServiceAgreementId: "not-a-real-id" })
    );

    expect(result?.message).toMatch(/valid, active master service agreement/i);
    const after = await prisma.project.count({ where: { workstreamId: workstreamAId } });
    expect(after).toBe(before);
  });
});
