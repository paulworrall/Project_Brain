import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterResponseQueue, flushAfterResponse } from "./helpers/afterResponse";

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
const { getVersionHistory } = await import("@/lib/updateVersions");
const { getBriefCompleteness } = await import("@/lib/briefCompleteness");

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

function notesFormData(content: string, source?: string): FormData {
  const formData = new FormData();
  formData.set("content", content);
  if (source) formData.set("source", source);
  return formData;
}

async function newProject(name: string, withPositionDocument = false): Promise<string> {
  const project = await prisma.project.create({
    data: { name, workstreamId, briefRawText: "BRIEF_MARKER: relaunch the loyalty app, budget £100k." },
  });
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

    mockParse.mockResolvedValueOnce({
      parsed_output: { summary: "Budget raised to £120k.", changeSummary: "Budget increased." },
    });
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

describe("versioned updates", () => {
  it("treats the brief as v1, and each update takes the next version", async () => {
    const projectId = await newProject("Versioned Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("First update."));
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("Second update."));

    const history = await getVersionHistory(projectId);
    expect(history.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(history[0].label).toBe("Initial brief");
    expect(history.slice(1).map((v) => v.content)).toEqual(["First update.", "Second update."]);
  });

  it("stores and shows the source — Client by default, or Internal team", async () => {
    const projectId = await newProject("Sourced Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("From the client."));
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("From our team.", "INTERNAL_TEAM")
    );

    const history = await getVersionHistory(projectId);
    expect(history.slice(1).map((v) => [v.versionNumber, v.source])).toEqual([
      [2, "CLIENT"],
      [3, "INTERNAL_TEAM"],
    ]);
  });

  it("rejects an unknown source without saving anything", async () => {
    const projectId = await newProject("Bad Source Project");
    const result = await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("Hello.", "SOMEONE_ELSE")
    );
    expect(result?.message).toMatch(/client or the internal team/i);
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(0);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("never changes an earlier version when a new one is added", async () => {
    const projectId = await newProject("Earlier Versions Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("Original v2."));
    const before = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });

    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("A correction, as v3."));

    const after = await prisma.knowledgeItem.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
  });

  it("tags key details read from an update with its version number and source", async () => {
    const projectId = await newProject("Key Detail Version Project");
    mockParse.mockResolvedValueOnce({
      parsed_output: keyAttributeFacts({ budget: { amount: "£90k", evidence: "Budget is £90k." } }),
    });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("Budget is £90k."));
    mockParse.mockResolvedValueOnce({
      parsed_output: keyAttributeFacts({ clientContact: { name: "Caroline", evidence: "Caroline runs it." } }),
    });
    await uploadKnowledgeItemAction(
      projectId,
      undefined,
      notesFormData("Caroline runs it.", "INTERNAL_TEAM")
    );

    const completeness = await getBriefCompleteness(projectId);
    const origin = (id: string) => completeness.attributes.find((a) => a.id === id)?.current?.origin;
    expect(origin("budget")).toEqual({ kind: "update", number: 2, internalTeam: false });
    expect(origin("clientContact")).toEqual({ kind: "update", number: 3, internalTeam: true });
  });

  it("summarises what changed against everything known before this version, after the save", async () => {
    const projectId = await newProject("Change Summary Project");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("EARLIER_UPDATE_MARKER"));
    afterResponseQueue().length = 0; // skip v2's own summary

    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, notesFormData("Budget now £150k."));
    mockParse.mockResolvedValueOnce({
      parsed_output: { summary: "Budget up to £150k.", changeSummary: "Budget increased." },
    });
    await flushAfterResponse();

    // The summary call (the email redraft runs after it).
    const prompt = mockParse.mock.calls
      .map((call) => call[0].messages[0].content as string)
      .find((content) => content.includes("<before>"))!;
    expect(prompt).toContain("BRIEF_MARKER");
    expect(prompt).toContain("EARLIER_UPDATE_MARKER");
    expect(prompt).toContain("Budget now £150k.");
    const latest = (await getVersionHistory(projectId)).at(-1)!;
    expect(latest).toMatchObject({ versionNumber: 3, summary: "Budget up to £150k.", changeSummary: "Budget increased." });
  });
});
