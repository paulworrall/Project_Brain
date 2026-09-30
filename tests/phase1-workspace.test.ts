import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration tests for the Phase 1 rework's repeatable actions —
// same convention as stage-1-5-happy-path.test.ts: only the Anthropic SDK,
// next/cache, and auth are mocked; everything else (Prisma queries, the
// Server Actions themselves) runs for real against a throwaway Hub, removed
// via cascade delete in afterAll.

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
  uploadKnowledgeItemAction,
  updateChecklistItemDetailAction,
  toggleChecklistItemAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_Phase1WorkspaceSpec";

let hubId: string;
let projectId: string;
let checklistItemId: string;

const positionFieldsV1 = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@acme.test",
  whatWeKnow: [{ topic: "Budget", detail: "Confirmed at £100k." }],
  whatWeNeedToFindOut: ["Whether the referral feature is in scope", "Launch date"],
  clientFlaggedOpenItems: [] as string[],
};

const positionFieldsV2 = {
  ...positionFieldsV1,
  whatWeKnow: [
    ...positionFieldsV1.whatWeKnow,
    { topic: "Referral feature", detail: "Confirmed in scope." },
  ],
  whatWeNeedToFindOut: ["Launch date"],
};

const positionFieldsV3 = {
  ...positionFieldsV2,
  whatWeKnow: [...positionFieldsV2.whatWeKnow, { topic: "Launch date", detail: "15 Sept 2026." }],
  whatWeNeedToFindOut: [] as string[],
};

function notesFormData(notes: string, title = "Client update") {
  const formData = new FormData();
  formData.set("title", title);
  formData.set("content", notes);
  return formData;
}

function detailFormData(detailText: string) {
  const formData = new FormData();
  formData.set("detailText", detailText);
  return formData;
}

function checkboxFormData(isComplete: boolean) {
  const formData = new FormData();
  if (isComplete) {
    formData.set("isComplete", "on");
  }
  return formData;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "Phase1SpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "Phase1SpecWorkstream", clientId: client.id },
  });
  const project = await prisma.project.create({
    data: { name: "Phase1 Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;

  await prisma.document.create({
    data: {
      projectId,
      type: "POSITION_DOCUMENT",
      versions: { create: { versionNumber: 1, stageNumber: 1, content: positionFieldsV1 } },
    },
  });

  // Mirrors what createProjectAction sets up at creation time (Intake and
  // Clarification Email complete, Get Clarifications in progress).
  const [intakeStage, clarificationEmailStage, getClarificationsStage] = await Promise.all([
    prisma.stage.findUniqueOrThrow({ where: { number: 1 } }),
    prisma.stage.findUniqueOrThrow({ where: { number: 2 } }),
    prisma.stage.findUniqueOrThrow({ where: { number: 3 } }),
  ]);
  await prisma.projectStageStatus.createMany({
    data: [
      { projectId, stageId: intakeStage.id, status: "COMPLETE" },
      { projectId, stageId: clarificationEmailStage.id, status: "COMPLETE" },
      { projectId, stageId: getClarificationsStage.id, status: "IN_PROGRESS" },
    ],
  });

  const checklistItem = await prisma.checklistItem.create({
    data: { projectId, label: "Assign job code", order: 0 },
  });
  checklistItemId = checklistItem.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("uploadKnowledgeItemAction (Position Document side)", () => {
  it("can be submitted multiple times in sequence, each producing a new Position Document version and a numbered update — no duplicate client-reply note", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: positionFieldsV2 });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("The referral feature is confirmed in scope.")
    );

    mockParse.mockResolvedValueOnce({ parsed_output: positionFieldsV3 });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("Launch date is confirmed for 15 Sept 2026.")
    );

    const document = await prisma.document.findUniqueOrThrow({
      where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(document.versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(document.versions[1].content).toEqual(positionFieldsV2);
    expect(document.versions[2].content).toEqual(positionFieldsV3);

    expect(await prisma.touchpointNote.count({ where: { projectId } })).toBe(0);

    const knowledgeItems = await prisma.knowledgeItem.findMany({
      where: { projectId },
      orderBy: { uploadedAt: "asc" },
    });
    expect(knowledgeItems.map((k) => [k.versionNumber, k.content])).toEqual([
      [2, "The referral feature is confirmed in scope."],
      [3, "Launch date is confirmed for 15 Sept 2026."],
    ]);
    // Each refreshed Position Document records the update it was built from.
    expect(document.versions.map((v) => v.builtFromVersion)).toEqual([null, 2, 3]);
  });
});

describe("checklist detail text", () => {
  it("persists independently of the isComplete checkbox", async () => {
    await updateChecklistItemDetailAction(
      projectId,
      checklistItemId,
      undefined,
      detailFormData("FIZ-2026-014")
    );
    let item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: checklistItemId } });
    expect(item.detailText).toBe("FIZ-2026-014");
    expect(item.isComplete).toBe(false);

    await toggleChecklistItemAction(projectId, checklistItemId, undefined, checkboxFormData(true));
    item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: checklistItemId } });
    expect(item.isComplete).toBe(true);
    expect(item.detailText).toBe("FIZ-2026-014");

    await toggleChecklistItemAction(
      projectId,
      checklistItemId,
      undefined,
      checkboxFormData(false)
    );
    item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: checklistItemId } });
    expect(item.isComplete).toBe(false);
    expect(item.detailText).toBe("FIZ-2026-014");
  });
});
