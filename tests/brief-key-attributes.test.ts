import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration test for the brief key attributes: AI extraction only
// ever writes suggestions, only a PM action confirms, and Generate SOW is
// refused (with exactly what's missing) until all 4 required attributes are
// confirmed. Only the Anthropic SDK, next/cache and auth are mocked — same
// convention as sow-generation.test.ts.

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
  confirmBriefAttributeAction,
  generateSowAction,
  startSowDevelopmentAction,
  suggestBriefAttributesAction,
  updateProjectSummaryAction,
  uploadKnowledgeItemAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");
const { getBriefCompleteness } = await import("@/lib/briefCompleteness");
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_BriefKeyAttributesSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;

const positionDocument = {
  primaryContactName: null,
  primaryContactEmail: null,
  whatWeKnow: [{ topic: "Audience", detail: "18-34 year olds" }],
  whatWeNeedToFindOut: [],
  clientFlaggedOpenItems: [],
};

const sowContent = {
  scopeSummary: { objectives: ["Relaunch"], background: "Background." },
  deliverables: [],
  services: {
    experienceCreative: { involvement: "Not included in this engagement" },
    business: { involvement: "Not included in this engagement" },
    architecture: { involvement: "Not included in this engagement" },
    techAndData: { involvement: "Not included in this engagement" },
    orchestration: { involvement: "Not included in this engagement" },
    other: { involvement: "Not included in this engagement", label: "Other" },
  },
  milestones: [],
  rolesAndResponsibilities: [],
  assumptions: [],
  outOfScope: [],
  risks: [],
};

/** A mocked key-attribute extraction stating only the given attributes. */
function extraction(attributes: Record<string, Record<string, unknown> | null>) {
  return keyAttributeFacts(attributes);
}

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

async function createProject(name: string, currentStageNumber = 3) {
  const project = await prisma.project.create({
    data: {
      name,
      workstreamId,
      currentStageNumber,
      briefRawText: "Budget is £50k. Launch in October.",
    },
  });
  await prisma.document.create({
    data: {
      projectId: project.id,
      type: "POSITION_DOCUMENT",
      versions: { create: { versionNumber: 1, stageNumber: 1, content: positionDocument } },
    },
  });
  return project.id;
}

async function confirmAllRequired(projectId: string) {
  await confirmBriefAttributeAction(
    projectId,
    "budget",
    undefined,
    formData({ amount: "£50k", currency: "GBP" })
  );
  await confirmBriefAttributeAction(
    projectId,
    "objective",
    undefined,
    formData({ objective: "Relaunch the app", successMeasures: "20% more actives" })
  );
  await confirmBriefAttributeAction(
    projectId,
    "timeline",
    undefined,
    formData({ startDate: "2026-10-01" })
  );
  await confirmBriefAttributeAction(
    projectId,
    "clientContact",
    undefined,
    formData({ name: "Caroline", email: "caroline@fizzy.example" })
  );
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({
    data: { name: "BriefKeyAttributesSpecClient", hubId },
  });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "BriefKeyAttributesSpecWorkstream", clientId: client.id },
  });
  workstreamId = workstream.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("AI-extracted key attributes", () => {
  it("records values extracted from an update as suggestions only, with their source — never confirmed", async () => {
    const projectId = await createProject("Upload Extraction Project");

    // 1st Claude call: the existing Position Document update; 2nd: key attributes.
    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({
        budget: { amount: "£50,000", currency: "GBP", evidence: "our budget is £50,000" },
      }),
    });

    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      formData({ title: "Call notes", content: "Client said our budget is £50,000." })
    );
    expect(result?.message).toBeUndefined();

    const rows = await prisma.briefAttributeValue.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attributeId: "budget", kind: "SUGGESTION", source: "UPDATE" });
    const knowledgeItem = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(rows[0].knowledgeItemId).toBe(knowledgeItem.id);

    const completeness = await getBriefCompleteness(projectId);
    const budget = completeness.attributes.find((a) => a.id === "budget")!;
    expect(budget.status).toBe("missing");
    expect(budget.suggestion?.values).toMatchObject({ amount: "£50,000", currency: "GBP" });
    expect(completeness.canProceed).toBe(false);
  });

  it("still saves the upload if key-attribute extraction fails", async () => {
    const projectId = await createProject("Extraction Failure Project");
    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      formData({ title: "Notes", content: "Some notes." })
    );
    expect(result?.message).toBeUndefined();
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(1);
    expect(await prisma.briefAttributeValue.count({ where: { projectId } })).toBe(0);

    // Never silent: the failure is recorded on the project for the PM to see…
    const failed = await getBriefCompleteness(projectId);
    expect(failed.extractionFailure?.message).toMatch(/key details/i);
    expect(failed.extractionFailure?.at).toBeInstanceOf(Date);

    // …and cleared by the next successful read.
    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockResolvedValueOnce({ parsed_output: extraction({}) });
    await uploadKnowledgeItemAction(projectId, undefined, formData({ title: "More", content: "More notes." }));
    expect((await getBriefCompleteness(projectId)).extractionFailure).toBeNull();
  });

  it("records a failure from 'Suggest from brief & inputs' too, and returns it to the PM", async () => {
    const projectId = await createProject("Suggest Failure Project");
    mockParse.mockRejectedValueOnce(new Error("400 compiled grammar is too large"));

    const result = await suggestBriefAttributesAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/key details/i);
    expect((await getBriefCompleteness(projectId)).extractionFailure).not.toBeNull();
  });

  it("suggests from the stored brief on demand, merging a later partial update over earlier values", async () => {
    const projectId = await createProject("On Demand Suggest Project");
    await prisma.knowledgeItem.create({
      data: { projectId, type: "NOTE", title: "Update", content: "Budget now £60k." },
    });

    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({
        budget: { amount: "£50k", currency: "GBP", evidence: "Budget is £50k" },
      }),
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({
        budget: { amount: "£60k", currency: null, evidence: "Budget now £60k" },
      }),
    });

    const result = await suggestBriefAttributesAction(projectId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const budget = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "budget"
    )!;
    expect(budget.status).toBe("missing");
    expect(budget.suggestion?.source).toBe("UPDATE");
    // The update only restated the amount; the brief's currency carries over.
    expect(budget.suggestion?.values).toMatchObject({ amount: "£60k", currency: "GBP" });
  });
});

describe("confirmBriefAttributeAction", () => {
  it("lets a PM confirm values, recorded as a PM entry", async () => {
    const projectId = await createProject("Confirm Project");
    const result = await confirmBriefAttributeAction(
      projectId,
      "clientContact",
      undefined,
      formData({ name: "Caroline", role: "", email: "caroline@fizzy.example" })
    );
    expect(result?.message).toBeUndefined();

    const contact = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "clientContact"
    )!;
    expect(contact.status).toBe("confirmed");
    expect(contact.confirmed?.source).toBe("PM_ENTRY");
  });

  it("keeps the suggestion's source when the PM accepts it unchanged", async () => {
    const projectId = await createProject("Accept Suggestion Project");
    const suggestion = await prisma.briefAttributeValue.create({
      data: {
        projectId,
        attributeId: "budget",
        kind: "SUGGESTION",
        source: "BRIEF",
        values: { amount: "£50k", currency: "GBP" },
      },
    });

    await confirmBriefAttributeAction(
      projectId,
      "budget",
      undefined,
      formData({ amount: "£50k", currency: "GBP", suggestionId: suggestion.id })
    );
    const budget = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "budget"
    )!;
    expect(budget.status).toBe("confirmed");
    expect(budget.confirmed?.source).toBe("BRIEF");
    expect(budget.suggestion).toBeNull();
  });

  it("records a PM entry when the PM edits a suggestion before confirming", async () => {
    const projectId = await createProject("Edit Suggestion Project");
    const suggestion = await prisma.briefAttributeValue.create({
      data: {
        projectId,
        attributeId: "budget",
        kind: "SUGGESTION",
        source: "BRIEF",
        values: { amount: "£50k", currency: "GBP" },
      },
    });
    await confirmBriefAttributeAction(
      projectId,
      "budget",
      undefined,
      formData({ amount: "£55k", currency: "GBP", suggestionId: suggestion.id })
    );
    const budget = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "budget"
    )!;
    expect(budget.confirmed?.source).toBe("PM_ENTRY");
    expect(budget.confirmed?.values.amount).toBe("£55k");
  });

  it("rejects an invalid email and an unknown attribute", async () => {
    const projectId = await createProject("Validation Project");
    const badEmail = await confirmBriefAttributeAction(
      projectId,
      "clientContact",
      undefined,
      formData({ name: "Caroline", email: "not-an-email" })
    );
    expect(badEmail?.message).toMatch(/email/i);

    const unknown = await confirmBriefAttributeAction(
      projectId,
      "notAThing",
      undefined,
      formData({})
    );
    expect(unknown?.message).toMatch(/unknown/i);
    expect(await prisma.briefAttributeValue.count({ where: { projectId } })).toBe(0);
  });

  it("keeps the timeline and the project's kick-off/target dates in sync in both directions", async () => {
    const projectId = await createProject("Timeline Sync Project");
    await confirmBriefAttributeAction(
      projectId,
      "timeline",
      undefined,
      formData({
        startDate: "2026-10-01",
        endDate: "2026-12-15",
        milestones: JSON.stringify([{ name: "Beta", date: "2026-11-01" }]),
      })
    );
    const afterConfirm = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(afterConfirm.kickOffDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(afterConfirm.targetCompletionDate?.toISOString().slice(0, 10)).toBe("2026-12-15");

    // Editing the dates in the project summary is a PM entry for the timeline too,
    // and keeps the confirmed milestones.
    const summaryResult = await updateProjectSummaryAction(
      projectId,
      undefined,
      // The summary form always submits every field.
      formData({
        jobCode: "",
        kickOffDate: "2026-10-08",
        targetCompletionDate: "2026-12-15",
        projectManagerId: "",
        rateCardId: "",
      })
    );
    expect(summaryResult?.message).toBeUndefined();
    const timeline = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "timeline"
    )!;
    expect(timeline.status).toBe("confirmed");
    expect(timeline.confirmed?.values).toMatchObject({
      startDate: "2026-10-08",
      endDate: "2026-12-15",
      milestones: [{ name: "Beta", date: "2026-11-01" }],
    });
  });
});

describe("Generate SOW gate", () => {
  async function projectWithTemplate(name: string, currentStageNumber?: number) {
    const projectId = await createProject(name, currentStageNumber);
    const template = await prisma.sOWTemplate.create({
      data: { name: `Template for ${name}`, scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
    });
    const version = await prisma.sOWTemplateVersion.create({
      data: {
        sowTemplateId: template.id,
        versionNumber: 1,
        fileName: "template.docx",
        fileBytes: Buffer.from("dummy"),
        extractedText: "Structure: Overview, Scope, Fees.",
      },
    });
    await startSowDevelopmentAction(
      projectId,
      undefined,
      formData({ sowTemplateId: template.id, sowTemplateVersionId: version.id })
    );
    return projectId;
  }

  it("denies the SOW and lists exactly which required attributes are missing or partial", async () => {
    const projectId = await projectWithTemplate("Gate Blocked Project");
    await confirmBriefAttributeAction(
      projectId,
      "budget",
      undefined,
      formData({ amount: "£50k", currency: "GBP" })
    );
    await confirmBriefAttributeAction(
      projectId,
      "objective",
      undefined,
      formData({ objective: "Relaunch" })
    );

    const result = await generateSowAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/can't generate the sow/i);
    expect(result?.missingAttributes?.map((a) => [a.id, a.status])).toEqual([
      ["objective", "partial"],
      ["timeline", "missing"],
      ["clientContact", "missing"],
    ]);
    expect(mockParse).not.toHaveBeenCalled();
    expect(await prisma.sOW.findUnique({ where: { projectId } })).toBeNull();
  });

  it("applies to projects already past Phase 1 too — they get warnings everywhere else, but no SOW until confirmed", async () => {
    const projectId = await projectWithTemplate("Gate Past Phase 1 Project", 6);
    const completeness = await getBriefCompleteness(projectId);
    expect(completeness.isPastPhase1).toBe(true);
    expect(completeness.warnings).toHaveLength(4);

    const result = await generateSowAction(projectId, undefined, new FormData());
    expect(result?.missingAttributes).toHaveLength(4);
  });

  it("generates the SOW once all 4 required attributes are confirmed", async () => {
    const projectId = await projectWithTemplate("Gate Passed Project");
    await confirmAllRequired(projectId);

    mockParse.mockResolvedValueOnce({ parsed_output: sowContent });
    const result = await generateSowAction(projectId, undefined, new FormData());

    expect(result?.message).toBeUndefined();
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(1);
  });
});
