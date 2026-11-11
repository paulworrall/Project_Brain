import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration tests for FB-008: the scope gate, specialist input rows,
// checklist steps, the project-complete lock and the Project assistant's
// routing. Claude is never called: the classifier and the chatbot answer are
// mocked, and the update flow's key-detail read goes through a mocked SDK.
// Skipped (loudly) until the FB-008 migration is applied.

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return { default: Object.assign(MockAnthropic, { RateLimitError, APIError }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const classify = vi.fn();
vi.mock("@/services/agents/assistant-classifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/assistant-classifier")>();
  return { ...actual, classifyAssistantMessage: (message: string) => classify(message) };
});
const answer = vi.fn();
vi.mock("@/services/agents/chatbot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/chatbot")>();
  return {
    ...actual,
    answerProjectQuestion: (projectId: string, q: string) => answer(projectId, q),
  };
});

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");
const { addEstimateVersion, createEstimate } = await import("./helpers/estimates");
const { confirmScope, reopenScope, updateSpecialistInput, setChecklistItemStep, addChecklistItem } =
  await import("@/lib/project/stepService");
const { assertProjectEditable, ProjectCompleteError } = await import("@/lib/project/projectGuards");
const { sendAssistantMessageAction, toggleChecklistItemAction, uploadKnowledgeItemAction } =
  await import("@/app/(dashboard)/projects/[projectId]/actions");
const { loadProjectPageData } = await import("@/lib/projectPageData");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const migrated = (
  await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('"SpecialistInput"')::text AS t`
)[0]?.t;
const describeDb = migrated ? describe : describe.skip;
if (!migrated) {
  console.warn(
    "[fb-008-steps] SpecialistInput table missing — apply the 20261111100000 migration to run these tests."
  );
}

const TEST_HUB_NAME = "TestHub_Fb008StepsSpec";
const STAMP = Date.now();
let hubId: string;
let workstreamId: string;
let clientId: string;
let pm: { id: string; role: "DELIVERY" };
let n = 0;

async function newProject(
  capabilities: ("EXPERIENCE_DESIGN" | "TECH_AND_DATA" | "BUSINESS_ARCHITECTURE")[] = []
) {
  n += 1;
  const project = await prisma.project.create({
    data: {
      name: `FB-008 Project ${n}`,
      workstreamId,
      briefRawText: "Relaunch the loyalty app.",
      capabilities: { create: capabilities.map((capability) => ({ capability })) },
      checklistItems: { create: [{ label: "Assign job code", order: 0 }] },
    },
  });
  return project.id;
}

/** Records a client approval directly (the FB-005 rules have their own tests). */
async function approve(projectId: string, type: "ESTIMATE" | "SOW") {
  const estimate = await createEstimate(prisma, {
    projectId,
    clientId,
    label: `Estimate ${projectId}`,
  });
  const ev = {
    id: await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 45675 }),
  };
  if (type === "ESTIMATE") {
    await prisma.commercialApproval.create({
      data: {
        projectId,
        documentType: "ESTIMATE",
        estimateVersionId: ev.id,
        clientApprovedOn: new Date("2026-10-18"),
        clientApproverName: "Caroline",
        fileSha256: "0".repeat(64),
        recordedByUserId: pm.id,
      },
    });
    return;
  }
  const sow = await prisma.sOW.create({ data: { projectId } });
  const sv = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber: 1,
      fileName: "sow.docx",
      fileBytes: Buffer.from("PK sow"),
      content: {},
      sourceEstimateVersionId: ev.id,
      sourceEstimateTotal: 45675,
      sourceEstimateCurrency: "USD",
    },
  });
  await prisma.commercialApproval.create({
    data: {
      projectId,
      documentType: "SOW",
      sowVersionId: sv.id,
      clientApprovedOn: new Date("2026-10-22"),
      clientApproverName: "Caroline",
      fileSha256: "0".repeat(64),
      recordedByUserId: pm.id,
    },
  });
}

function assistantForm(message: string, mode?: string): FormData {
  const formData = new FormData();
  formData.set("message", message);
  if (mode) formData.set("mode", mode);
  return formData;
}

beforeAll(async () => {
  if (!migrated) return;
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "Fb008SpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({
    data: { name: "Fb008SpecWs", clientId: client.id },
  });
  workstreamId = workstream.id;
  const user = await prisma.user.create({
    data: { name: "Pat PM", email: `pat-${STAMP}@fb008.test`, passwordHash: "x", role: "DELIVERY" },
  });
  pm = { id: user.id, role: "DELIVERY" };
  mockAuth.mockResolvedValue({ user: pm });
});

afterAll(async () => {
  if (migrated) {
    await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.delete({ where: { id: pm.id } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
  classify.mockReset();
  answer.mockReset();
});

describeDb("checklist steps", () => {
  it("existing items default to the Brief step", async () => {
    const projectId = await newProject();
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { projectId } });
    expect(item.step).toBe("brief");
  });

  it("an item can be moved to another step, and new items are added to a step", async () => {
    const projectId = await newProject();
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { projectId } });
    expect(
      await setChecklistItemStep(prisma, pm, { projectId, itemId: item.id, step: "sow" })
    ).toMatchObject({
      ok: true,
    });
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: item.id } })).step).toBe(
      "sow"
    );

    const added = await addChecklistItem(prisma, pm, {
      projectId,
      label: "Book estimation session",
      step: "estimate",
    });
    expect(added.ok).toBe(true);
    const row = await prisma.checklistItem.findFirstOrThrow({
      where: { projectId, label: "Book estimation session" },
    });
    expect(row).toMatchObject({ step: "estimate", order: 1 });
  });

  it("refuses anyone who isn't signed in, and an item from another project", async () => {
    const projectId = await newProject();
    const other = await newProject();
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { projectId: other } });
    expect(
      await setChecklistItemStep(prisma, null, { projectId, itemId: item.id, step: "sow" })
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await setChecklistItemStep(prisma, pm, { projectId, itemId: item.id, step: "sow" })
    ).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describeDb("scope gate", () => {
  it("confirm sets scopeConfirmedAt/By; reopen clears it", async () => {
    const projectId = await newProject();
    const confirmed = await confirmScope(prisma, pm, { projectId });
    expect(confirmed.ok).toBe(true);
    let project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.scopeConfirmedAt).toBeInstanceOf(Date);
    expect(project.scopeConfirmedByUserId).toBe(pm.id);

    expect((await reopenScope(prisma, pm, { projectId })).ok).toBe(true);
    project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.scopeConfirmedAt).toBeNull();
    expect(project.scopeConfirmedByUserId).toBeNull();
  });

  it("reopening is refused once an estimate is approved", async () => {
    const projectId = await newProject();
    await confirmScope(prisma, pm, { projectId });
    await approve(projectId, "ESTIMATE");
    const result = await reopenScope(prisma, pm, { projectId });
    expect(result).toMatchObject({ ok: false, code: "ESTIMATE_APPROVED" });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).scopeConfirmedAt
    ).not.toBeNull();
  });

  it("drives the Brief step status, its summary and the current step", async () => {
    const projectId = await newProject();
    let data = await loadProjectPageData(projectId);
    expect(data?.stepStatuses.brief).toBe("in_progress");
    expect(data?.currentStepId).toBe("brief");
    expect(data?.systemChecks.estimate.find((c) => c.id === "scope-confirmed")?.met).toBe(false);

    await confirmScope(prisma, pm, { projectId });
    // React's cache() only memoises inside a server render, so this re-reads.
    data = await loadProjectPageData(projectId);
    expect(data?.stepStatuses.brief).toBe("done");
    expect(data?.stepSummaries.brief?.text).toMatch(/^Scope confirmed · /);
    expect(data?.currentStepId).toBe("estimate");
    expect(data?.systemChecks.estimate.find((c) => c.id === "scope-confirmed")?.met).toBe(true);
  });
});

describeDb("specialist input tracker", () => {
  it("upserts one row per confirmed capability, with status and note", async () => {
    const projectId = await newProject(["EXPERIENCE_DESIGN", "TECH_AND_DATA"]);
    expect(
      await updateSpecialistInput(prisma, pm, {
        projectId,
        capability: "EXPERIENCE_DESIGN",
        status: "requested",
        note: "Asked Sam",
      })
    ).toMatchObject({ ok: true });
    await updateSpecialistInput(prisma, pm, {
      projectId,
      capability: "EXPERIENCE_DESIGN",
      status: "received",
    });
    const rows = await prisma.specialistInput.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "received", note: null, updatedByUserId: pm.id });
  });

  it("refuses a capability that isn't confirmed for the project", async () => {
    const projectId = await newProject(["EXPERIENCE_DESIGN"]);
    const result = await updateSpecialistInput(prisma, pm, {
      projectId,
      capability: "TECH_AND_DATA",
      status: "requested",
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("rows follow the confirmed list: removing a capability hides its row but keeps the data", async () => {
    const projectId = await newProject([
      "EXPERIENCE_DESIGN",
      "TECH_AND_DATA",
      "BUSINESS_ARCHITECTURE",
    ]);
    await updateSpecialistInput(prisma, pm, {
      projectId,
      capability: "EXPERIENCE_DESIGN",
      status: "received",
    });
    await updateSpecialistInput(prisma, pm, {
      projectId,
      capability: "TECH_AND_DATA",
      status: "received",
    });
    let data = await loadProjectPageData(projectId);
    expect(data?.specialistRows.map((r) => r.status)).toEqual([
      "received",
      "received",
      "not_requested",
    ]);
    expect(data?.stepStatuses.estimate).toBe("in_progress");

    await prisma.projectCapability.deleteMany({
      where: { projectId, capability: "TECH_AND_DATA" },
    });
    data = await loadProjectPageData(projectId);
    expect(data?.specialistRows.map((r) => r.capability)).toEqual([
      "EXPERIENCE_DESIGN",
      "BUSINESS_ARCHITECTURE",
    ]);
    // Hidden, not deleted.
    expect(await prisma.specialistInput.count({ where: { projectId } })).toBe(2);
  });
});

describeDb("project complete", () => {
  it("locks every FB-008 mutation and the existing project actions once the SOW is approved", async () => {
    const projectId = await newProject(["EXPERIENCE_DESIGN"]);
    await confirmScope(prisma, pm, { projectId });
    await approve(projectId, "SOW");

    await expect(assertProjectEditable(projectId, prisma)).rejects.toBeInstanceOf(
      ProjectCompleteError
    );
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { projectId } });
    for (const result of [
      await reopenScope(prisma, pm, { projectId }),
      await setChecklistItemStep(prisma, pm, { projectId, itemId: item.id, step: "sow" }),
      await addChecklistItem(prisma, pm, { projectId, label: "Late item", step: "sow" }),
      await updateSpecialistInput(prisma, pm, {
        projectId,
        capability: "EXPERIENCE_DESIGN",
        status: "received",
      }),
    ]) {
      expect(result).toMatchObject({ ok: false, code: "PROJECT_COMPLETE" });
    }

    const toggle = new FormData();
    toggle.set("isComplete", "on");
    expect(await toggleChecklistItemAction(projectId, item.id, undefined, toggle)).toEqual({
      message: "This project is complete. Changes will need a change request (coming soon).",
    });
    const update = new FormData();
    update.set("content", "Budget is now £60k.");
    expect(await uploadKnowledgeItemAction(projectId, undefined, update)).toMatchObject({
      message: expect.stringMatching(/project is complete/),
    });

    const data = await loadProjectPageData(projectId);
    expect(data?.projectComplete).toBe(true);
    expect(data?.projectStatus).toBe("COMPLETE");
    expect(data?.currentStepId).toBe("sow");
    expect(data?.stepSummaries.sow?.downloadHref).toBeTruthy();
  });
});

describeDb("Project assistant routing", () => {
  it("a question is answered and nothing is recorded", async () => {
    const projectId = await newProject();
    classify.mockResolvedValue({
      intent: "question",
      question: "What's the budget?",
      update: null,
    });
    answer.mockResolvedValue("£50k.");
    const result = await sendAssistantMessageAction(projectId, assistantForm("What's the budget?"));
    expect(result).toEqual({ ok: true, data: { kind: "answer", answer: "£50k." } });
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(0);
  });

  it("an update is recorded through the Keep-up-to-date flow and confirmed with what changed", async () => {
    const projectId = await newProject();
    classify.mockResolvedValue({ intent: "update", question: null, update: "Budget is now £60k." });
    mockParse.mockResolvedValueOnce({
      parsed_output: keyAttributeFacts({
        budget: { amount: "£60,000", currency: "GBP", evidence: "£60k" },
      }),
    });
    const result = await sendAssistantMessageAction(
      projectId,
      assistantForm("Budget is now £60k.")
    );
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "updated", confirmation: "Updated: budget" },
    });
    expect(answer).not.toHaveBeenCalled();
    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.content).toBe("Budget is now £60k.");
  });

  it("both: records the update first, then answers the question", async () => {
    const projectId = await newProject();
    classify.mockResolvedValue({
      intent: "both",
      question: "Is that over the cap?",
      update: "Budget is now £60k.",
    });
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    answer.mockImplementation(async () => {
      // The answer is asked for after the update is saved.
      expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(1);
      return "No.";
    });
    const result = await sendAssistantMessageAction(
      projectId,
      assistantForm("Budget is now £60k — over the cap?")
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "answer_and_updated",
        answer: "No.",
        confirmation: expect.stringMatching(/^Saved/),
      },
    });
    expect(answer).toHaveBeenCalledWith(projectId, "Is that over the cap?");
  });

  it("ambiguous: asks which was meant, and the choice is routed without classifying again", async () => {
    const projectId = await newProject();
    classify.mockResolvedValue({ intent: "unclear", question: null, update: null });
    expect(await sendAssistantMessageAction(projectId, assistantForm("budget 60k"))).toEqual({
      ok: true,
      data: { kind: "choose" },
    });
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(0);

    answer.mockResolvedValue("It's £50k.");
    const asQuestion = await sendAssistantMessageAction(
      projectId,
      assistantForm("budget 60k", "question")
    );
    expect(asQuestion).toMatchObject({ ok: true, data: { kind: "answer" } });
    expect(classify).toHaveBeenCalledTimes(1);

    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    const asUpdate = await sendAssistantMessageAction(
      projectId,
      assistantForm("budget 60k", "update")
    );
    expect(asUpdate).toMatchObject({ ok: true, data: { kind: "updated" } });
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(1);
  });

  it("on a complete project: still answers questions, declines updates", async () => {
    const projectId = await newProject();
    await approve(projectId, "SOW");
    classify.mockResolvedValue({
      intent: "both",
      question: "When did the SOW get approved?",
      update: "Budget £70k.",
    });
    answer.mockResolvedValue("22 October.");
    const result = await sendAssistantMessageAction(projectId, assistantForm("..."));
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "answer_and_declined",
        answer: "22 October.",
        declined: "This project is complete. Changes will need a change request (coming soon).",
      },
    });
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(0);
  });
});
