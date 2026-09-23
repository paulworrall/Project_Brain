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
// Real implementation by default — individual tests override the resolved
// factors to prove a saved version keeps the hours-per-day it was priced at.
vi.mock("@/services/pricing/unit-conversion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/pricing/unit-conversion")>();
  return { ...actual, getConversionFactors: vi.fn(actual.getConversionFactors) };
});

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { getConversionFactors } = await import("@/services/pricing/unit-conversion");
const mockGetConversionFactors = getConversionFactors as ReturnType<typeof vi.fn>;

const {
  createEstimateAction,
  addEstimateRoleInputAction,
  updateRoleResolutionQuantityAction,
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

function roleInputFormData(content: string) {
  const formData = new FormData();
  formData.set("content", content);
  return formData;
}

function resolveFormData(rateCardLineItemId: string) {
  const formData = new FormData();
  formData.set("rateCardLineItemId", rateCardLineItemId);
  return formData;
}

function quantityFormData(quantity: number) {
  const formData = new FormData();
  formData.set("quantity", String(quantity));
  return formData;
}

function resolveWithUnitFormData(rateCardLineItemId: string, unit: string) {
  const formData = resolveFormData(rateCardLineItemId);
  formData.set("unit", unit);
  return formData;
}

/** One confidently-matched Senior Developer role, via the real add-role action. */
async function addSeniorDeveloperRole(
  estimateId: string,
  seniorLineId: string,
  role: { rawRoleText: string; quantity: number; unit: string | null; rawUnitText: string | null }
) {
  mockParse.mockResolvedValueOnce({
    parsed_output: [
      {
        rawRoleText: role.rawRoleText,
        extractedRole: "Developer",
        extractedLevel: "Senior",
        extractedCapability: "TECH_AND_DATA",
        quantity: role.quantity,
        unit: role.unit,
        rawUnitText: role.rawUnitText,
      },
    ],
  });
  mockParse.mockResolvedValueOnce({
    parsed_output: [
      {
        rawRoleText: role.rawRoleText,
        matchType: "ROLE_AND_LEVEL" as const,
        confidence: 0.97,
        suggestedRateCardLineId: seniorLineId,
      },
    ],
  });
  return addEstimateRoleInputAction(estimateId, undefined, roleInputFormData(role.rawRoleText));
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "EstimateBuildSpecClient", hubId } });
  clientId = client.id;
  const otherClient = await prisma.client.create({
    data: { name: "OtherClient_EstimateBuildSpec", hubId },
  });
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
      pendingResolutions: [],
      rateCardLines: [],
      reviewContent: null,
      latestVersion: null,
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

describe("addEstimateRoleInputAction", () => {
  it("lazily parses+caches the rate card lines on the first-ever submission against a version, and doesn't repeat it on a second", async () => {
    // A dedicated, throwaway estimate — its only job is to prove the
    // lazy-parse-and-cache behavior in isolation, sharing the same
    // rateCardVersionId the main flow test below relies on already being
    // cached by the time it runs.
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Lazy Parse Cache Spec Estimate", rateCardVersionId },
    });

    // First submission: 3 Claude calls (rate-card-line parse, extraction,
    // matching) — a NO_MATCH result is used deliberately so this doesn't
    // need to predict the seeded lines' ids, which don't exist until the
    // parse step (inside this same call) creates them.
    mockParse.mockResolvedValueOnce({ parsed_output: rateCardLines });
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Copywriter for 2 days",
          extractedRole: "Copywriter",
          extractedLevel: null,
          extractedCapability: "EXPERIENCE_STRATEGY",
          quantity: 2,
          unit: "days",
        },
      ],
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Copywriter for 2 days",
          matchType: "NO_MATCH" as const,
          confidence: 0,
          suggestedRateCardLineId: null,
        },
      ],
    });

    const firstAdd = await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("1 Copywriter for 2 days.")
    );
    expect(firstAdd.message).toBeUndefined();
    expect(mockParse).toHaveBeenCalledTimes(3);

    const seededLines = await prisma.rateCardLineItem.findMany({ where: { rateCardVersionId } });
    expect(seededLines).toHaveLength(3);

    const resolution = await prisma.roleResolution.findFirstOrThrow({
      where: { estimateId: estimate.id },
    });
    expect(resolution.capability).toBe("EXPERIENCE_STRATEGY");
    expect(resolution.resolvedAt).toBeNull();

    // Second submission on the same rate card version: only 2 Claude calls
    // — the parse is NOT repeated, proving the cache held.
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Copywriter for 1 day",
          extractedRole: "Copywriter",
          extractedLevel: null,
          extractedCapability: "EXPERIENCE_STRATEGY",
          quantity: 1,
          unit: "days",
        },
      ],
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Copywriter for 1 day",
          matchType: "NO_MATCH" as const,
          confidence: 0,
          suggestedRateCardLineId: null,
        },
      ],
    });
    const callsBeforeSecondAdd = mockParse.mock.calls.length;
    await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("1 Copywriter for 1 day.")
    );
    expect(mockParse.mock.calls.length - callsBeforeSecondAdd).toBe(2);

    const lineCountAfterSecondAdd = await prisma.rateCardLineItem.count({
      where: { rateCardVersionId },
    });
    expect(lineCountAfterSecondAdd).toBe(3);
  });

  it("blocks a role-only match, auto-resolves a role-and-level match (mixed in one submission), then resolves/saves correctly and stays append-only on a second save", async () => {
    // By this point rateCardVersionId already has its 3 lines cached (from
    // the lazy-parse test above), so this submission makes exactly 2
    // Claude calls: extraction + matching, no repeated parse.
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Full Flow Estimate", rateCardVersionId },
    });

    const seededLines = await prisma.rateCardLineItem.findMany({ where: { rateCardVersionId } });
    const juniorLine = seededLines.find((l) => l.level === "Junior")!;
    const seniorLine = seededLines.find((l) => l.level === "Senior")!;

    const extractedRoles = [
      {
        rawRoleText: "1 Developer for 5 days",
        extractedRole: "Developer",
        extractedLevel: null,
        extractedCapability: "TECH_AND_DATA" as const,
        quantity: 5,
        unit: "days",
      },
      {
        rawRoleText: "1 Senior Developer for 3 days",
        extractedRole: "Developer",
        extractedLevel: "Senior",
        extractedCapability: "TECH_AND_DATA" as const,
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
    mockParse.mockResolvedValueOnce({ parsed_output: extractedRoles });
    mockParse.mockResolvedValueOnce({ parsed_output: matchResults });

    const added = await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("Need 1 Developer for 5 days, and 1 Senior Developer for 3 days.")
    );
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(added.view?.pendingResolutions).toHaveLength(1);

    const resolutions = await prisma.roleResolution.findMany({
      where: { estimateId: estimate.id },
    });
    expect(resolutions).toHaveLength(2);

    const roleOnly = resolutions.find((r) => r.matchType === "ROLE_ONLY")!;
    expect(roleOnly.capability).toBe("TECH_AND_DATA");
    expect(roleOnly.resolvedAt).toBeNull();
    expect(roleOnly.resolvedRateCardLineId).toBeNull();
    expect(roleOnly.suggestedRateCardLineId).toBe(juniorLine.id);

    const roleAndLevel = resolutions.find((r) => r.matchType === "ROLE_AND_LEVEL")!;
    expect(roleAndLevel.capability).toBe("TECH_AND_DATA");
    expect(roleAndLevel.resolvedAt).not.toBeNull();
    expect(roleAndLevel.resolvedById).toBeNull(); // system-resolved, not a PM choice
    expect(roleAndLevel.resolvedRateCardLineId).toBe(seniorLine.id);

    // Save must refuse while the role-only case is unresolved.
    const blockedSave = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    expect(blockedSave.message).toMatch(/1 role still needs your review/i);

    // PM confirms the role-only case against the Junior line.
    await resolveRoleResolutionAction(roleOnly.id, undefined, resolveFormData(juniorLine.id));
    const afterResolve = await prisma.roleResolution.findUniqueOrThrow({
      where: { id: roleOnly.id },
    });
    expect(afterResolve.resolvedAt).not.toBeNull();
    expect(afterResolve.resolvedRateCardLineId).toBe(juniorLine.id);

    const pendingAfterResolve = await prisma.roleResolution.count({
      where: { estimateId: estimate.id, resolvedAt: null },
    });
    expect(pendingAfterResolve).toBe(0);

    // Save now succeeds, with deterministic pricing:
    // Junior 400/day * 5 = 2000, Senior 700/day * 3 = 2100, total 4100.
    const saveResult = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    expect(saveResult.message).toBeUndefined();
    expect(saveResult.versionId).toBeDefined();
    expect(saveResult.view?.latestVersion?.id).toBe(saveResult.versionId);

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

    // Saving again (nothing changed) is append-only — a new version,
    // version 1's own line items are untouched.
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

    const allVersions = await prisma.estimateVersion.findMany({
      where: { estimateId: estimate.id },
    });
    expect(allVersions).toHaveLength(2);
  });

  it("is atomic — a failed extraction leaves zero EstimateCapabilityInput/RoleResolution rows behind", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Atomicity Spec Estimate (extraction failure)", rateCardVersionId },
    });

    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    const result = await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("Some content that will fail to extract.")
    );

    expect(result.message).toBeTruthy();
    const inputs = await prisma.estimateCapabilityInput.findMany({
      where: { estimateId: estimate.id },
    });
    expect(inputs).toHaveLength(0);
    const resolutions = await prisma.roleResolution.findMany({
      where: { estimateId: estimate.id },
    });
    expect(resolutions).toHaveLength(0);
  });

  it("is atomic — a failed matching call leaves zero EstimateCapabilityInput/RoleResolution rows behind", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Atomicity Spec Estimate (matching failure)", rateCardVersionId },
    });

    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Developer for 2 days",
          extractedRole: "Developer",
          extractedLevel: null,
          extractedCapability: "TECH_AND_DATA",
          quantity: 2,
          unit: "days",
        },
      ],
    });
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    const result = await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("1 Developer for 2 days.")
    );

    expect(result.message).toBeTruthy();
    const inputs = await prisma.estimateCapabilityInput.findMany({
      where: { estimateId: estimate.id },
    });
    expect(inputs).toHaveLength(0);
    const resolutions = await prisma.roleResolution.findMany({
      where: { estimateId: estimate.id },
    });
    expect(resolutions).toHaveLength(0);
  });
});

describe("updateRoleResolutionQuantityAction", () => {
  it("updates an already-resolved role's quantity and the recomputed fee/total flows through the fresh view", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Quantity Update Spec Estimate", rateCardVersionId },
    });
    const seededLines = await prisma.rateCardLineItem.findMany({ where: { rateCardVersionId } });
    const seniorLine = seededLines.find((l) => l.level === "Senior")!;

    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Senior Developer for 2 days",
          extractedRole: "Developer",
          extractedLevel: "Senior",
          extractedCapability: "TECH_AND_DATA",
          quantity: 2,
          unit: "days",
        },
      ],
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Senior Developer for 2 days",
          matchType: "ROLE_AND_LEVEL" as const,
          confidence: 0.97,
          suggestedRateCardLineId: seniorLine.id,
        },
      ],
    });
    await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("1 Senior Developer for 2 days.")
    );

    const resolution = await prisma.roleResolution.findFirstOrThrow({
      where: { estimateId: estimate.id },
    });
    expect(Number(resolution.extractedQuantity)).toBe(2);

    const updateResult = await updateRoleResolutionQuantityAction(
      resolution.id,
      undefined,
      quantityFormData(4)
    );
    expect(updateResult.message).toBeUndefined();

    const afterUpdate = await prisma.roleResolution.findUniqueOrThrow({
      where: { id: resolution.id },
    });
    expect(Number(afterUpdate.extractedQuantity)).toBe(4);

    // 700/day * 4 days = 2800 after the update — proves the fresh view's
    // reviewContent recomputed the fee/total from the new quantity, not a
    // stale cached value.
    expect(Number(updateResult.view?.reviewContent?.totalValue)).toBe(2800);
  });

  it("rejects updating a role that is still pending (not yet resolved)", async () => {
    const estimate = await prisma.estimate.create({
      data: {
        projectId,
        label: "Quantity Update Spec Estimate (pending reject)",
        rateCardVersionId,
      },
    });

    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Developer for 3 days",
          extractedRole: "Developer",
          extractedLevel: null,
          extractedCapability: "TECH_AND_DATA",
          quantity: 3,
          unit: "days",
        },
      ],
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: [
        {
          rawRoleText: "1 Developer for 3 days",
          matchType: "ROLE_ONLY" as const,
          confidence: 0.5,
          suggestedRateCardLineId: null,
        },
      ],
    });
    await addEstimateRoleInputAction(
      estimate.id,
      undefined,
      roleInputFormData("1 Developer for 3 days.")
    );

    const pending = await prisma.roleResolution.findFirstOrThrow({
      where: { estimateId: estimate.id },
    });
    expect(pending.resolvedAt).toBeNull();

    const result = await updateRoleResolutionQuantityAction(
      pending.id,
      undefined,
      quantityFormData(10)
    );
    expect(result.message).toMatch(/must be resolved/i);

    const unchanged = await prisma.roleResolution.findUniqueOrThrow({ where: { id: pending.id } });
    expect(Number(unchanged.extractedQuantity)).toBe(3);
  });
});

describe("estimate units", () => {
  async function seniorLineId(): Promise<string> {
    const lines = await prisma.rateCardLineItem.findMany({ where: { rateCardVersionId } });
    return lines.find((l) => l.level === "Senior")!.id;
  }

  it("flags a role with a missing unit for PM review instead of defaulting to hours", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Missing Unit Spec Estimate", rateCardVersionId },
    });
    const lineId = await seniorLineId();

    // A confident rate-card match — the missing unit alone must still hold it for review.
    const added = await addSeniorDeveloperRole(estimate.id, lineId, {
      rawRoleText: "Senior Developer x 2",
      quantity: 2,
      unit: null,
      rawUnitText: null,
    });
    expect(added.message).toBeUndefined();

    const resolution = await prisma.roleResolution.findFirstOrThrow({
      where: { estimateId: estimate.id },
    });
    expect(resolution.extractedUnit).toBeNull();
    expect(added.view?.pendingResolutions).toHaveLength(1);
    expect(added.view?.pendingResolutions[0].extractedUnit).toBeNull();
    expect(added.view?.reviewContent).toBeNull();

    const blockedSave = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    expect(blockedSave.message).toMatch(/needs your review/i);

    // Confirming the rate card line without choosing a unit is refused.
    const noUnit = await resolveRoleResolutionAction(
      resolution.id,
      undefined,
      resolveFormData(lineId)
    );
    expect(noUnit.message).toMatch(/unit/i);
    const stillFlagged = await prisma.roleResolution.findUniqueOrThrow({
      where: { id: resolution.id },
    });
    expect(stillFlagged.extractedUnit).toBeNull();

    const resolved = await resolveRoleResolutionAction(
      resolution.id,
      undefined,
      resolveWithUnitFormData(lineId, "DAYS")
    );
    expect(resolved.message).toBeUndefined();
    expect(resolved.view?.pendingResolutions).toHaveLength(0);

    const saved = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    const version = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: saved.versionId },
      include: { lineItems: true },
    });
    expect(version.lineItems[0].unit).toBe("DAYS");
    expect(Number(version.lineItems[0].hours)).toBe(15);
    expect(Number(version.totalValue)).toBe(1400); // 2 days @ 700/day
  });

  it("stores the hours-per-day used on each saved version, and a later change doesn't alter past versions", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Hours Per Day Spec Estimate", rateCardVersionId },
    });
    // Hours against a DAILY rate, so the hours-per-day value actually moves the fee.
    await addSeniorDeveloperRole(estimate.id, await seniorLineId(), {
      rawRoleText: "Senior Developer, 15 hours",
      quantity: 15,
      unit: "hours",
      rawUnitText: "hours",
    });

    const first = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    const v1 = await prisma.estimateVersion.findUniqueOrThrow({ where: { id: first.versionId } });
    expect(Number(v1.hoursPerDay)).toBe(7.5);
    expect(Number(v1.daysPerWeek)).toBe(5);
    expect(v1.needsRecalculation).toBe(false);
    expect(Number(v1.totalValue)).toBe(1400); // 15 hrs = 2 days @ 700/day

    // e.g. a future per-client MSA value of 8 hrs/day.
    mockGetConversionFactors.mockResolvedValueOnce({ hoursPerDay: 8, daysPerWeek: 5 });
    const second = await saveEstimateVersionAction(estimate.id, undefined, new FormData());
    const v2 = await prisma.estimateVersion.findUniqueOrThrow({ where: { id: second.versionId } });
    expect(Number(v2.hoursPerDay)).toBe(8);
    expect(Number(v2.totalValue)).toBe(1312.5); // 15 hrs @ 700/8 per hr

    const v1Reloaded = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: v1.id },
      include: { lineItems: true },
    });
    expect(Number(v1Reloaded.hoursPerDay)).toBe(7.5);
    expect(Number(v1Reloaded.totalValue)).toBe(1400);
    expect(Number(v1Reloaded.lineItems[0].feeSubtotal)).toBe(1400);
    expect((v1Reloaded.content as { hoursPerDay?: number }).hoursPerDay).toBe(7.5);
  });

  it("lets the PM correct a resolved role's unit, recomputing the fee", async () => {
    const estimate = await prisma.estimate.create({
      data: { projectId, label: "Unit Update Spec Estimate", rateCardVersionId },
    });
    await addSeniorDeveloperRole(estimate.id, await seniorLineId(), {
      rawRoleText: "Senior Developer 1",
      quantity: 1,
      unit: "days",
      rawUnitText: "days",
    });
    const resolution = await prisma.roleResolution.findFirstOrThrow({
      where: { estimateId: estimate.id },
    });

    const formData = quantityFormData(1);
    formData.set("unit", "WEEKS");
    const result = await updateRoleResolutionQuantityAction(resolution.id, undefined, formData);
    expect(result.message).toBeUndefined();
    expect(result.view?.reviewContent?.totalValue).toBe(3500); // 1 week = 5 days @ 700/day
    const line = result.view?.reviewContent?.capabilitySections[0].lineItems[0];
    expect(line?.unit).toBe("WEEKS");
    expect(line?.hours).toBe(37.5);
  });
});
