import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// End-to-end integration test of the full Stage 1-5 happy path (CLAUDE.md:
// "Test the full Stage 1-5 flow end-to-end"). Calls the REAL Server Actions
// in sequence against the real dev database — not a re-implementation of
// their logic — with only the framework/runtime boundaries Next.js provides
// mocked (Anthropic, revalidatePath, redirect, auth), matching this
// codebase's existing convention of mocking external services while keeping
// application logic real. Everything is created under one throwaway Hub,
// removed via cascade delete in afterAll, same convention as schema.test.ts.

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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT_MOCK");
  }),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const { createProjectAction } = await import("@/app/(dashboard)/projects/new/actions");
const {
  submitClientUpdateAction,
  generateDraftScopeDocumentAction,
  submitSpecialistFeedbackAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_HappyPathSpec";
const PROJECT_NAME = "Happy Path Project";

let hubId: string;
let workstreamId: string;

const briefClassification = {
  briefType: "WORD_DOC" as const,
  summary: "A loyalty app refresh brief with a confirmed budget and one open gap.",
};

const positionFieldsV1 = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@acme.test",
  whatWeKnow: [
    { topic: "Budget", detail: "Confirmed at £100k." },
    { topic: "Timeline", detail: "Launch before the holidays." },
  ],
  whatWeNeedToFindOut: ["Whether the referral feature is in scope"],
  clientFlaggedOpenItems: [] as string[],
};

const clarificationEmail = {
  subject: "Quick questions on the Acme loyalty app refresh",
  bodyText: "Hi Jamie, following up on one open item...",
};

const positionFieldsV2 = {
  ...positionFieldsV1,
  whatWeKnow: [
    ...positionFieldsV1.whatWeKnow,
    { topic: "Referral feature", detail: "Confirmed in scope." },
  ],
  whatWeNeedToFindOut: [] as string[],
};

const draftScope = {
  objectives: ["Refresh the loyalty app before the holidays"],
  deliverables: ["Redesigned app", "Referral feature"],
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: {
    contacts: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
    capabilities: ["Design", "Engineering"],
  },
  budget: { summary: "Confirmed at £100k", isConfirmed: true },
  assumptionsAndConstraints: ["UK market only"],
  flaggedGaps: [] as string[],
};

const deliverablesAndServices = {
  deliverables: ["Redesigned app", "Referral feature"],
  services: {
    experienceCreative: { involvement: "Lead design." },
    business: { involvement: "Not required." },
    architecture: { involvement: "Not required." },
    techAndData: { involvement: "Build the referral feature." },
    orchestration: { involvement: "Coordinate the schedule." },
    other: { involvement: "Not required.", label: "Other" },
  },
  openQuestionsRisks: [] as string[],
  outstandingGapsCarriedForward: [] as string[],
};

function briefFormData() {
  const formData = new FormData();
  formData.set("workstreamId", workstreamId);
  formData.set("name", PROJECT_NAME);
  formData.set(
    "briefText",
    "Acme wants a refreshed loyalty app before the holidays. Budget confirmed at £100k. Referral feature TBC."
  );
  return formData;
}

function notesFormData(notes: string) {
  const formData = new FormData();
  formData.set("notes", notes);
  return formData;
}

function feedbackFormData(feedback: string) {
  const formData = new FormData();
  formData.set("feedback", feedback);
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({
    data: { name: "HappyPathSpecClient", hubId },
  });
  const workstream = await prisma.workstream.create({
    data: { name: "HappyPathSpecWorkstream", clientId: client.id },
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

describe("Stage 1-5 happy path", () => {
  it("carries a project from brief upload through the Deliverables + Services Document", async () => {
    // Stage 1 — Intake: classify, extract, draft email (3 Claude calls).
    mockParse
      .mockResolvedValueOnce({ parsed_output: briefClassification })
      .mockResolvedValueOnce({ parsed_output: positionFieldsV1 })
      .mockResolvedValueOnce({ parsed_output: clarificationEmail });

    await expect(createProjectAction(undefined, briefFormData())).rejects.toThrow(
      "NEXT_REDIRECT_MOCK"
    );

    const project = await prisma.project.findUniqueOrThrow({
      where: { workstreamId_name: { workstreamId, name: PROJECT_NAME } },
    });

    // Stage 3 — Get Clarifications: add a client update, extraction (1 Claude call).
    mockParse.mockResolvedValueOnce({ parsed_output: positionFieldsV2 });
    await submitClientUpdateAction(
      project.id,
      undefined,
      notesFormData("The referral feature is confirmed in scope after all.")
    );

    // Stage 4 — Triage: generate the Draft Scope Document (1 Claude call).
    mockParse.mockResolvedValueOnce({ parsed_output: draftScope });
    await generateDraftScopeDocumentAction(project.id, undefined, new FormData());

    // Stage 5 — Specialist Review: Deliverables + Services Document (1 Claude call).
    mockParse.mockResolvedValueOnce({ parsed_output: deliverablesAndServices });
    await submitSpecialistFeedbackAction(
      project.id,
      undefined,
      feedbackFormData("Design and Tech & Data are needed; no dedicated architecture work.")
    );

    // Final state: all 6 Claude calls consumed in order, nothing left over.
    expect(mockParse).toHaveBeenCalledTimes(6);

    const stageStatuses = await prisma.projectStageStatus.findMany({
      where: { projectId: project.id },
      include: { stage: true },
      orderBy: { stage: { number: "asc" } },
    });
    const statusByStage = new Map(stageStatuses.map((s) => [s.stage.number, s.status]));
    expect(statusByStage.get(1)).toBe("COMPLETE");
    expect(statusByStage.get(2)).toBe("COMPLETE");
    expect(statusByStage.get(3)).toBe("COMPLETE");
    expect(statusByStage.get(4)).toBe("COMPLETE");
    expect(statusByStage.get(5)).toBe("COMPLETE");
    expect(statusByStage.get(6)).toBe("IN_PROGRESS");

    const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(finalProject.currentStageNumber).toBe(6);

    const documents = await prisma.document.findMany({
      where: { projectId: project.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    const documentsByType = new Map(documents.map((d) => [d.type, d]));

    expect(documentsByType.get("CLARIFICATION_EMAIL")?.versions[0]?.content).toEqual(
      clarificationEmail
    );
    expect(documentsByType.get("POSITION_DOCUMENT")?.versions[0]?.content).toEqual(
      positionFieldsV2
    );
    expect(documentsByType.get("POSITION_DOCUMENT")?.versions[0]?.versionNumber).toBe(2);
    expect(documentsByType.get("CHECKLIST")).toBeDefined();
    expect(documentsByType.get("DRAFT_SCOPE_DOCUMENT")?.versions[0]?.content).toEqual(
      draftScope
    );
    expect(documentsByType.get("DELIVERABLES_SERVICES_DOCUMENT")?.versions[0]?.content).toEqual(
      deliverablesAndServices
    );

    const touchpointNotes = await prisma.touchpointNote.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });
    expect(touchpointNotes.map((n) => n.type)).toEqual([
      "CLARIFICATION_REPLY",
      "SPECIALIST_REVIEW",
    ]);

    const checklistItems = await prisma.checklistItem.findMany({
      where: { projectId: project.id },
    });
    expect(checklistItems.length).toBeGreaterThan(0);
  });
});
