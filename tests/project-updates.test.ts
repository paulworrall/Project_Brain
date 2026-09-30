import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { flushAfterResponse } from "./helpers/afterResponse";

// Real-DB tests for "Keep This Project Up to Date" updates. Only the
// Anthropic SDK, next/cache and auth are mocked; after-response work (the AI
// summary) is queued by tests/setup.ts and run with flushAfterResponse().

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
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");
const { uploadKnowledgeItemAction } = await import("@/app/(dashboard)/projects/[projectId]/actions");
const { updateLabel } = await import("@/lib/updateLabel");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_ProjectUpdatesSpec";

let hubId: string;
let workstreamId: string;

const positionFields = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@acme.test",
  whatWeKnow: [{ topic: "Audience", detail: "Existing loyalty members." }],
  clientFlaggedOpenItems: [] as string[],
};

function notesFormData(content: string): FormData {
  const formData = new FormData();
  formData.set("content", content);
  return formData;
}

async function newProject(name: string, withPositionDocument = false): Promise<string> {
  const project = await prisma.project.create({ data: { name, workstreamId } });
  if (withPositionDocument) {
    await prisma.document.create({
      data: {
        projectId: project.id,
        type: "POSITION_DOCUMENT",
        versions: { create: { versionNumber: 1, stageNumber: 1, content: positionFields } },
      },
    });
  }
  return project.id;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "UpdatesSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "UpdatesSpecWorkstream", clientId: client.id },
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

describe("saving an update without a title", () => {
  it("saves with no title and gets a label from its date, time and type", async () => {
    const projectId = await newProject("Untitled Update Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });

    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("Client says the launch moves to March.")
    );

    expect(result?.message).toBeUndefined();
    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.title).toBeNull();
    expect(item.content).toBe("Client says the launch moves to March.");
    expect(updateLabel(item)).toMatch(/^Update — \d{1,2} \w+ \d{4}, \d{2}:\d{2} \(Note\)$/);
  });

  it("adds a one-line AI summary after the update is saved — never before", async () => {
    const projectId = await newProject("Summarised Update Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });

    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("Budget is now £120k."));

    // Saved, and the summary hasn't been asked for yet.
    expect(mockParse).toHaveBeenCalledTimes(1);
    let item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.summary).toBeNull();

    mockParse.mockResolvedValueOnce({ parsed_output: { summary: "Budget raised to £120k." } });
    await flushAfterResponse();

    item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.summary).toBe("Budget raised to £120k.");
  });

  it("keeps the update when summarising fails — the date label stands on its own", async () => {
    const projectId = await newProject("Failed Summary Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });

    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("New stakeholder joining from procurement.")
    );
    expect(result?.message).toBeUndefined();

    mockParse.mockRejectedValueOnce(new Error("summary service down"));
    await expect(flushAfterResponse()).resolves.toBeUndefined();

    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.content).toBe("New stakeholder joining from procurement.");
    expect(item.summary).toBeNull();
    expect(updateLabel(item)).toMatch(/^Update — /);
  });

  it("keeps the update when the Position Document can't be refreshed from it, and says so", async () => {
    const projectId = await newProject("Failed Refresh Project", true);
    mockParse.mockRejectedValueOnce(new Error("clarification extraction failed")); // Position Document refresh
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() }); // key details

    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("The referral feature is out of scope.")
    );

    expect(result?.message).toBeUndefined();
    expect(result?.notice).toMatch(/saved/i);
    expect(result?.notice).toMatch(/Position Document/);
    const items = await prisma.knowledgeItem.findMany({ where: { projectId } });
    expect(items.map((i) => i.content)).toEqual(["The referral feature is out of scope."]);
    const versions = await prisma.documentVersion.count({
      where: { document: { projectId, type: "POSITION_DOCUMENT" } },
    });
    expect(versions).toBe(1);
  });

  it("still ignores a title if an older form sends one", async () => {
    const projectId = await newProject("Legacy Form Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    const formData = notesFormData("Notes from an old browser tab.");
    formData.set("title", "Old-style title");

    await uploadKnowledgeItemAction(projectId, undefined, formData);

    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.title).toBeNull();
  });
});
