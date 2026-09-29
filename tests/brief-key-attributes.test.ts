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
  saveBriefAttributeAction,
  generateSowAction,
  startSowDevelopmentAction,
  rereadBriefAttributesAction,
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
  await saveBriefAttributeAction(
    projectId,
    "budget",
    undefined,
    formData({ amount: "£50k (GBP)" })
  );
  await saveBriefAttributeAction(
    projectId,
    "objective",
    undefined,
    formData({ objective: "Relaunch the app", successMeasures: "20% more actives" })
  );
  await saveBriefAttributeAction(
    projectId,
    "timeline",
    undefined,
    formData({ startDate: "2026-10-01" })
  );
  await saveBriefAttributeAction(
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

describe("Key details captured by the agent — trusted by default", () => {
  it("captures values from an update straight away, tagged with the update they came from", async () => {
    const projectId = await createProject("Upload Extraction Project");

    // 1st Claude call: the existing Position Document update; 2nd: key attributes.
    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({
        budget: { amount: "£50,000", evidence: "our budget is £50,000" },
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
    expect(rows[0]).toMatchObject({ attributeId: "budget", source: "UPDATE" });
    const knowledgeItem = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(rows[0].knowledgeItemId).toBe(knowledgeItem.id);

    const completeness = await getBriefCompleteness(projectId);
    const budget = completeness.attributes.find((a) => a.id === "budget")!;
    expect(budget.status).toBe("confirmed");
    expect(budget.current?.values).toEqual({ amount: "£50,000" });
    expect(budget.current?.origin).toEqual({ kind: "update", number: 1 });
    expect(budget.current?.evidence).toBe("our budget is £50,000");
    // The other required details are still missing, so the gate stays shut.
    expect(completeness.canProceed).toBe(false);
  });

  it("lets the latest update win over a PM's edit — but only for the details it talks about", async () => {
    const projectId = await createProject("Latest Wins Project");
    await saveBriefAttributeAction(projectId, "budget", undefined, formData({ amount: "£70k" }));
    await saveBriefAttributeAction(
      projectId,
      "objective",
      undefined,
      formData({ objective: "PM objective", successMeasures: "PM measures" })
    );

    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({ budget: { amount: "£80k", evidence: "budget is now £80k" } }),
    });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      formData({ title: "Update", content: "The budget is now £80k." })
    );

    const attributes = (await getBriefCompleteness(projectId)).attributes;
    const budget = attributes.find((a) => a.id === "budget")!;
    expect(budget.current?.values.amount).toBe("£80k");
    expect(budget.current?.origin).toEqual({ kind: "update", number: 1 });
    const objective = attributes.find((a) => a.id === "objective")!;
    expect(objective.current?.values.objective).toBe("PM objective");
    expect(objective.current?.origin).toEqual({ kind: "pm" });
  });

  it("writes a captured start and end date to the project's own dates", async () => {
    const projectId = await createProject("Captured Dates Project");
    mockParse.mockResolvedValueOnce({ parsed_output: positionDocument });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({ timeline: { startDate: "2026-10-01", endDate: "2026-12-15" } }),
    });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      formData({ title: "Dates", content: "We start 1 Oct and finish 15 Dec." })
    );

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.kickOffDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(project.targetCompletionDate?.toISOString().slice(0, 10)).toBe("2026-12-15");
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

  it("records a failure from 'Re-read brief & inputs' too, and returns it to the PM", async () => {
    const projectId = await createProject("Suggest Failure Project");
    mockParse.mockRejectedValueOnce(new Error("400 compiled grammar is too large"));

    const result = await rereadBriefAttributesAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/key details/i);
    expect((await getBriefCompleteness(projectId)).extractionFailure).not.toBeNull();
  });

  it("re-reads the brief and inputs to fill empty details, the later source winning", async () => {
    const projectId = await createProject("On Demand Suggest Project");
    await prisma.knowledgeItem.create({
      data: { projectId, type: "NOTE", title: "Update", content: "Budget now £60k." },
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({ budget: { amount: "£50k", evidence: "Budget is £50k" } }),
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({ budget: { amount: "£60k", evidence: "Budget now £60k" } }),
    });

    const result = await rereadBriefAttributesAction(projectId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const budget = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "budget"
    )!;
    expect(budget.status).toBe("confirmed");
    expect(budget.current?.values.amount).toBe("£60k");
    expect(budget.current?.origin).toEqual({ kind: "update", number: 1 });
  });

  it("never lets a re-read undo a PM's edit — it only fills what's still empty", async () => {
    const projectId = await createProject("Reread Keeps Edit Project");
    await saveBriefAttributeAction(projectId, "budget", undefined, formData({ amount: "£70k" }));
    mockParse.mockResolvedValueOnce({
      parsed_output: extraction({
        budget: { amount: "£50k" },
        clientContact: { name: "Caroline", email: "caroline@fizzy.example" },
      }),
    });

    await rereadBriefAttributesAction(projectId, undefined, new FormData());

    const attributes = (await getBriefCompleteness(projectId)).attributes;
    const budget = attributes.find((a) => a.id === "budget")!;
    expect(budget.current?.values.amount).toBe("£70k");
    expect(budget.current?.origin).toEqual({ kind: "pm" });
    const contact = attributes.find((a) => a.id === "clientContact")!;
    expect(contact.current?.values.name).toBe("Caroline");
    expect(contact.current?.origin).toEqual({ kind: "brief" });
  });
});

describe("saveBriefAttributeAction — the inline Update/Add", () => {
  it("records a PM edit, replacing what was captured", async () => {
    const projectId = await createProject("Confirm Project");
    await prisma.briefAttributeValue.create({
      data: {
        projectId,
        attributeId: "budget",
        kind: "SUGGESTION",
        source: "BRIEF",
        values: { amount: "£50k", currency: "GBP" },
      },
    });

    const result = await saveBriefAttributeAction(
      projectId,
      "budget",
      undefined,
      formData({ amount: "£55k (GBP)" })
    );
    expect(result?.message).toBeUndefined();

    const budget = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "budget"
    )!;
    expect(budget.status).toBe("confirmed");
    expect(budget.current?.source).toBe("PM_ENTRY");
    expect(budget.current?.origin).toEqual({ kind: "pm" });
    expect(budget.current?.values.amount).toBe("£55k (GBP)");
  });

  it("returns a detail to Missing when saved empty", async () => {
    const projectId = await createProject("Clear Detail Project");
    await saveBriefAttributeAction(
      projectId,
      "clientContact",
      undefined,
      formData({ name: "Caroline", role: "", email: "caroline@fizzy.example" })
    );
    await saveBriefAttributeAction(
      projectId,
      "clientContact",
      undefined,
      formData({ name: "", role: "", email: "" })
    );

    const contact = (await getBriefCompleteness(projectId)).attributes.find(
      (a) => a.id === "clientContact"
    )!;
    expect(contact.status).toBe("missing");
  });

  it("rejects an invalid email and an unknown attribute", async () => {
    const projectId = await createProject("Validation Project");
    const badEmail = await saveBriefAttributeAction(
      projectId,
      "clientContact",
      undefined,
      formData({ name: "Caroline", email: "not-an-email" })
    );
    expect(badEmail?.message).toMatch(/email/i);

    const unknown = await saveBriefAttributeAction(
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
    await saveBriefAttributeAction(
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
    expect(timeline.current?.values).toMatchObject({
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
    await saveBriefAttributeAction(
      projectId,
      "budget",
      undefined,
      formData({ amount: "£50k (GBP)" })
    );
    await saveBriefAttributeAction(
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

  it("applies to projects already past Phase 1 too — they get warnings everywhere else, but no SOW until captured", async () => {
    const projectId = await projectWithTemplate("Gate Past Phase 1 Project", 6);
    const completeness = await getBriefCompleteness(projectId);
    expect(completeness.isPastPhase1).toBe(true);
    expect(completeness.warnings).toHaveLength(4);

    const result = await generateSowAction(projectId, undefined, new FormData());
    expect(result?.missingAttributes).toHaveLength(4);
  });

  it("generates the SOW once all 4 required attributes are captured", async () => {
    const projectId = await projectWithTemplate("Gate Passed Project");
    await confirmAllRequired(projectId);

    mockParse.mockResolvedValueOnce({ parsed_output: sowContent });
    const result = await generateSowAction(projectId, undefined, new FormData());

    expect(result?.message).toBeUndefined();
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(1);
  });
});
