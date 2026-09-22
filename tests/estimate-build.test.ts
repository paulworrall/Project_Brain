import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration test for the Build The Estimate feature — same
// convention as capabilities-and-estimate-brief.test.ts / stage-1-5-happy-path.test.ts:
// only the Anthropic SDK, next/cache, and auth are mocked; everything else
// (Prisma queries, the Server Actions themselves, the matching/pricing code)
// runs for real against a throwaway Hub, removed via cascade delete in
// afterAll.

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return {
    default: Object.assign(MockAnthropic, { RateLimitError, APIError }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const {
  createEstimateAction,
  addOrReviseCapabilityInputAction,
  analyzeAndBuildEstimateAction,
  resolveRoleResolutionAction,
  saveEstimateVersionAction,
} = await import("@/app/(dashboard)/projects/[projectId]/estimates/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_EstimateBuildSpec";

let hubId: string;
let clientId: string;
let projectId: string;
let rateCardVersionId: string;

const rateCardLines = [
  { role: "Developer", level: "Junior", rateType: "DAILY" as const, rate: 400, currency: "GBP" },
  { role: "Developer", level: "Senior", rateType: "DAILY" as const, rate: 700, currency: "GBP" },
  { role: "Designer", level: "Mid", rateType: "DAILY" as const, rate: 500, currency: "GBP" },
];

function capabilityInputFormData(capability: string, content: string) {
  const formData = new FormData();
  formData.set("capability", capability);
  formData.set("content", content);
  return formData;
}

function resolveFormData(rateCardLineItemId: string) {
  const formData = new FormData();
  formData.set("rateCardLineItemId", rateCardLineItemId);
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "EstimateBuildSpecClient", hubId } });
  clientId = client.id;
  const otherClient = await prisma.client.create({ data: { name: "OtherClient_EstimateBuildSpec", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "EstimateBuildSpecWorkstream", clientId },
  });
  const project = await prisma.project.create({
    data: { name: "Estimate Build Spec Project", workstreamId: workstream.id, jobCode: "EBS-001" },
  });
  projectId = project.id;

  const rateCard = await prisma.rateCard.create({
    data: { clientId, name: "Project Rates", currency: "GBP" },
  });
  const rateCardVersion = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionNumber: 1,
      fileName: "rates.xlsx",
      fileBytes: Buffer.from("dummy rate card bytes"),
      extractedText: "Developer,Junior,400/day\nDeveloper,Senior,700/day\nDesigner,Mid,500/day",
      effectiveFrom: new Date("2026-01-01"),
      status: "ENABLED",
    },
  });
  rateCardVersionId = rateCardVersion.id;

  // A rate card that belongs to a DIFFERENT client, to prove
  // createEstimateAction actually enforces client scoping, not just the
  // (already-scoped) dropdown.
  const otherRateCard = await prisma.rateCard.create({
    data: { clientId: otherClient.id, name: "Other Client Rates" },
  });
  await prisma.rateCardVersion.create({
    data: {
      rateCardId: otherRateCard.id,
      versionNumber: 1,
      fileName: "other-rates.xlsx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "irrelevant",
      effectiveFrom: new Date("2026-01-01"),
      status: "ENABLED",
    },
  });
});

afterAll(async () => {
  // Estimate/EstimateVersion.rateCardVersionId is deliberately onDelete:
  // Restrict (never silently lose a saved version's pricing source) — so
  // Estimates must be cleared before the Hub cascade reaches RateCardVersion,
  // or Postgres refuses the delete.
  await prisma.estimate.deleteMany({ where: { projectId } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("createEstimateAction", () => {
  it("creates an estimate track locked to the chosen rate card version", async () => {
    const formData = new FormData();
    formData.set("label", "Initial Estimate");
    formData.set("rateCardVersionId", rateCardVersionId);

    const result = await createEstimateAction(projectId, undefined, formData);

    expect(result.message).toBeUndefined();
    expect(result.estimateId).toBeDefined();
    expect(result.label).toBe("Initial Estimate");
    expect(result.view).toEqual({
      existingInputs: [],
      pendingResolutions: [],
      rateCardLines: [],
      reviewContent: null,
    });

    const estimate = await prisma.estimate.findFirstOrThrow({
      where: { projectId, label: "Initial Estimate" },
    });
    expect(estimate.id).toBe(result.estimateId);
    expect(estimate.rateCardVersionId).toBe(rateCardVersionId);
  });

  it("rejects a rate card version that belongs to a different client", async () => {
    const otherRateCard = await prisma.rateCard.findFirstOrThrow({
      where: { clientId: { not: clientId }, name: "Other Client Rates" },
      include: { versions: true },
    });

    const formData = new FormData();
    formData.set("label", "Should Fail");
    formData.set("rateCardVersionId", otherRateCard.versions[0].id);

    const result = await createEstimateAction(projectId, undefined, formData);

    expect(result?.message).toMatch(/not valid for this client/i);
    const found = await prisma.estimate.findFirst({ where: { projectId, label: "Should Fail" } });
    expect(found).toBeNull();
  });
});

describe("addOrReviseCapabilityInputAction", () => {
  it("adds a capability input, then revises it in place — deleting stale role resolutions", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Revise Spec Estimate", rateCardVersionId },
    });

    await addOrReviseCapabilityInputAction(
      estimate.id,
      undefined,
      capabilityInputFormData("EXPERIENCE_DESIGN", "1 Mid Designer for 4 days.")
    );

    let inputs = await prisma.estimateCapabilityInput.findMany({ where: { estimateId: estimate.id } });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].rawContent).toBe("1 Mid Designer for 4 days.");

    // Simulate a prior analysis having already produced a RoleResolution for
    // this input, to prove revising deletes it rather than leaving it stale.
    await prisma.roleResolution.create({
      data: {
        estimateId: estimate.id,
        estimateCapabilityInputId: inputs[0].id,
        rawRoleText: "1 Mid Designer for 4 days.",
        extractedRole: "Designer",
        extractedLevel: "Mid",
        extractedQuantity: 4,
        extractedUnit: "days",
        matchType: "ROLE_AND_LEVEL",
        confidence: 0.9,
        resolvedAt: new Date(),
      },
    });

    await addOrReviseCapabilityInputAction(
      estimate.id,
      undefined,
      capabilityInputFormData("EXPERIENCE_DESIGN", "2 Mid Designers for 6 days each.")
    );

    inputs = await prisma.estimateCapabilityInput.findMany({ where: { estimateId: estimate.id } });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].rawContent).toBe("2 Mid Designers for 6 days each.");

    const staleResolutions = await prisma.roleResolution.findMany({
      where: { estimateCapabilityInputId: inputs[0].id },
    });
    expect(staleResolutions).toHaveLength(0);
  });
});

describe("analyze & build, role resolution, and save", () => {
  it("parses+caches the rate card lines only once, blocks the role-only case, auto-resolves the fully-specified case, then resolves/saves correctly and stays append-only on a second save", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Full Flow Estimate", rateCardVersionId },
    });

    // --- Step A: first analyze run with no capability inputs yet — this is
    // what triggers the lazy rate-card-line parse (nothing to extract/match
    // yet, so exactly one Claude call happens: the line-item parse).
    mockParse.mockResolvedValueOnce({ parsed_output: rateCardLines });
    const firstAnalyze = await analyzeAndBuildEstimateAction(estimate.id, undefined, new FormData());
    expect(firstAnalyze.view?.pendingResolutions).toHaveLength(0);
    expect(mockParse).toHaveBeenCalledTimes(1);

    const seededLines = await prisma.rateCardLineItem.findMany({ where: { rateCardVersionId } });
    expect(seededLines).toHaveLength(3);
    const juniorLine = seededLines.find((l) => l.level === "Junior")!;
    const seniorLine = seededLines.find((l) => l.level === "Senior")!;

    // --- Step B: add one capability input describing two roles — one with
    // no level stated (role-only, must block), one fully specified.
    await addOrReviseCapabilityInputAction(
      estimate.id,
      undefined,
      capabilityInputFormData(
        "TECH_AND_DATA",
        "Need 1 Developer for 5 days, and 1 Senior Developer for 3 days."
      )
    );

    const extractedRoles = [
      {
        rawRoleText: "1 Developer for 5 days",
        extractedRole: "Developer",
        extractedLevel: null,
        quantity: 5,
        unit: "days",
      },
      {
        rawRoleText: "1 Senior Developer for 3 days",
        extractedRole: "Developer",
        extractedLevel: "Senior",
        quantity: 3,
        unit: "days",
      },
    ];
    const matchResults = [
      {
        rawRoleText: "1 Developer for 5 days",
        matchType: "ROLE_ONLY" as const,
        confidence: 0.6,
        suggestedRateCardLineId: juniorLine.id,
      },
      {
        rawRoleText: "1 Senior Developer for 3 days",
        matchType: "ROLE_AND_LEVEL" as const,
        confidence: 0.95,
        suggestedRateCardLineId: seniorLine.id,
      },
    ];

    // --- Step C: second analyze run — only 2 Claude calls this time
    // (extraction + matching); the rate-card-line parse is NOT repeated,
    // proving the cache from Step A held.
    mockParse.mockResolvedValueOnce({ parsed_output: extractedRoles });
    mockParse.mockResolvedValueOnce({ parsed_output: matchResults });
    const callsBeforeSecondAnalyze = mockParse.mock.calls.length;
    const secondAnalyze = await analyzeAndBuildEstimateAction(estimate.id, undefined, new FormData());
    expect(mockParse.mock.calls.length - callsBeforeSecondAnalyze).toBe(2);
    expect(secondAnalyze.view?.pendingResolutions).toHaveLength(1);

    const resolutions = await prisma.roleResolution.findMany({ where: { estimateId: estimate.id } });
    expect(resolutions).toHaveLength(2);

    const roleOnly = resolutions.find((r) => r.matchType === "ROLE_ONLY")!;
    expect(roleOnly.resolvedAt).toBeNull();
    expect(roleOnly.resolvedRateCardLineId).toBeNull();
    expect(roleOnly.suggestedRateCardLineId).toBe(juniorLine.id);

    const roleAndLevel = resolutions.find((r) => r.matchType === "ROLE_AND_LEVEL")!;
    expect(roleAndLevel.resolvedAt).not.toBeNull();
    expect(roleAndLevel.resolvedById).toBeNull(); // system-resolved, not a PM choice
    expect(roleAndLevel.resolvedRateCardLineId).toBe(seniorLine.id);

    // --- Step D: a third analyze run with nothing new should make zero
    // additional Claude calls at all (both inputs already have resolutions).
    const callsBeforeThirdAnalyze = mockParse.mock.calls.length;
    await analyzeAndBuildEstimateAction(estimate.id, undefined, new FormData());
    expect(mockParse.mock.calls.length).toBe(callsBeforeThirdAnalyze);

    // --- Step E: save must refuse while the role-only case is unresolved.
    const blockedSave = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    expect(blockedSave.message).toMatch(/1 role still needs your review/i);

    // --- Step F: PM confirms the role-only case against the Junior line.
    await resolveRoleResolutionAction(roleOnly.id, undefined, resolveFormData(juniorLine.id));
    const afterResolve = await prisma.roleResolution.findUniqueOrThrow({ where: { id: roleOnly.id } });
    expect(afterResolve.resolvedAt).not.toBeNull();
    expect(afterResolve.resolvedRateCardLineId).toBe(juniorLine.id);

    const pendingAfterResolve = await prisma.roleResolution.count({
      where: { estimateId: estimate.id, resolvedAt: null },
    });
    expect(pendingAfterResolve).toBe(0);

    // --- Step G: save now succeeds, with deterministic pricing:
    // Junior 400/day * 5 = 2000, Senior 700/day * 3 = 2100, total 4100.
    const saveResult = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    expect(saveResult.message).toBeUndefined();
    expect(saveResult.versionId).toBeDefined();

    const v1 = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: saveResult.versionId },
      include: { lineItems: true },
    });
    expect(v1.versionNumber).toBe(1);
    expect(Number(v1.totalValue)).toBe(4100);
    expect(v1.currency).toBe("GBP");
    expect(v1.capabilitiesIncluded).toEqual(["TECH_AND_DATA"]);
    expect(v1.lineItems).toHaveLength(2);
    expect(Buffer.from(v1.fileBytes).subarray(0, 2).toString("utf-8")).toBe("PK");
    const v1LineItemIds = v1.lineItems.map((li) => li.id).sort();

    // --- Step H: saving again (nothing changed) is append-only — a new
    // version, version 1's own line items are untouched.
    const secondSave = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    const v2 = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: secondSave.versionId },
      include: { lineItems: true },
    });
    expect(v2.versionNumber).toBe(2);
    expect(Number(v2.totalValue)).toBe(4100);

    const v1Reloaded = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: v1.id },
      include: { lineItems: true },
    });
    expect(v1Reloaded.lineItems.map((li) => li.id).sort()).toEqual(v1LineItemIds);
    expect(Number(v1Reloaded.totalValue)).toBe(4100);

    const allVersions = await prisma.estimateVersion.findMany({ where: { estimateId: estimate.id } });
    expect(allVersions).toHaveLength(2);
  });
});
