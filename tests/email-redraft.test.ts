import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterResponseQueue, flushAfterResponse } from "./helpers/afterResponse";

// Phase 4: each new update produces a fresh draft of the client
// clarification email, as a new version, after the update is saved. Real DB;
// only the Anthropic SDK, next/cache and auth are mocked.

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
const { uploadKnowledgeItemAction, regenerateClarificationEmailAction } = await import(
  "@/app/(dashboard)/projects/[projectId]/actions"
);
const { getOutputFreshness } = await import("@/lib/outputFreshness");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_EmailRedraftSpec";

let hubId: string;
let workstreamId: string;
let pmUserId: string;

const intakeEmail = { subject: "Intake questions", bodyText: "Hi, a few questions from the brief." };
const summary = { summary: "Budget raised.", changeSummary: "Budget increased." };

function updateForm(content: string, source?: string): FormData {
  const formData = new FormData();
  formData.set("content", content);
  if (source) formData.set("source", source);
  return formData;
}

/** A project with its intake email (v1), and no Position Document so an update makes one Claude call. */
async function newProject(name: string): Promise<string> {
  const project = await prisma.project.create({
    data: { name, workstreamId, briefRawText: "Relaunch the loyalty app." },
  });
  await prisma.document.create({
    data: {
      projectId: project.id,
      type: "CLARIFICATION_EMAIL",
      versions: { create: { versionNumber: 1, stageNumber: 1, content: intakeEmail, builtFromVersion: 1 } },
    },
  });
  return project.id;
}

async function emailVersions(projectId: string) {
  return prisma.documentVersion.findMany({
    where: { document: { projectId, type: "CLARIFICATION_EMAIL" } },
    orderBy: { versionNumber: "asc" },
  });
}

/** Saves an update, then runs the after-save work: summary, then the email redraft. */
async function addUpdateAndFinish(
  projectId: string,
  content: string,
  redraft: { subject: string; bodyText: string } | Error,
  source?: string
): Promise<void> {
  mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
  const result = await uploadKnowledgeItemAction(projectId, undefined, updateForm(content, source));
  expect(result?.message).toBeUndefined();
  mockParse.mockResolvedValueOnce({ parsed_output: summary });
  if (redraft instanceof Error) mockParse.mockRejectedValueOnce(redraft);
  else mockParse.mockResolvedValueOnce({ parsed_output: redraft });
  await flushAfterResponse();
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "RedraftSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "RedraftSpecWorkstream", clientId: client.id },
  });
  workstreamId = workstream.id;
  const pm = await prisma.user.create({
    data: { email: "redraft-spec-pm@projectbrain.test", name: "Redraft Spec PM", passwordHash: "x", role: "DELIVERY" },
  });
  pmUserId = pm.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.user.delete({ where: { id: pmUserId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
  afterResponseQueue().length = 0;
});

describe("a new client email draft on each update", () => {
  it("creates a new email version after the update is saved, from the latest context, recording the update that triggered it", async () => {
    const projectId = await newProject("Redraft On Update");

    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, updateForm("UPDATE_MARKER: budget is now £150k."));
    // Saving didn't wait for the draft.
    expect(await emailVersions(projectId)).toHaveLength(1);

    mockParse.mockResolvedValueOnce({ parsed_output: summary });
    mockParse.mockResolvedValueOnce({ parsed_output: { subject: "Updated questions", bodyText: "Hi, thanks for the update." } });
    await flushAfterResponse();

    const versions = await emailVersions(projectId);
    expect(versions.map((v) => [v.versionNumber, v.builtFromVersion, v.triggeredByUpdateVersion])).toEqual([
      [1, 1, null],
      [2, 2, 2],
    ]);
    expect(versions[1].content).toEqual({ subject: "Updated questions", bodyText: "Hi, thanks for the update." });
    const draftPrompt = JSON.stringify(mockParse.mock.calls.at(-1)![0].messages);
    expect(draftPrompt).toContain("UPDATE_MARKER");
    expect((await getOutputFreshness(projectId)).clarificationEmail?.stale).toBe(false);
  });

  it("drafts after an internal-team update too, one new version per update", async () => {
    const projectId = await newProject("Redraft Per Update");
    await addUpdateAndFinish(projectId, "From the client.", { subject: "Draft 2", bodyText: "Body 2" });
    await addUpdateAndFinish(projectId, "From our team.", { subject: "Draft 3", bodyText: "Body 3" }, "INTERNAL_TEAM");

    const versions = await emailVersions(projectId);
    expect(versions.map((v) => [v.versionNumber, v.triggeredByUpdateVersion])).toEqual([
      [1, null],
      [2, 2],
      [3, 3],
    ]);
  });

  it("never changes a previous version — including one a PM regenerated themselves", async () => {
    const projectId = await newProject("Keeps Previous");
    // A PM's own redraft (v2).
    const { auth } = await import("@/lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: { id: pmUserId } });
    mockParse.mockResolvedValueOnce({ parsed_output: { subject: "PM's draft", bodyText: "PM body" } });
    await regenerateClarificationEmailAction(projectId, undefined, new FormData());
    const before = await emailVersions(projectId);
    expect(before[1]).toMatchObject({ versionNumber: 2, createdById: pmUserId });

    await addUpdateAndFinish(projectId, "A new update.", { subject: "Auto draft", bodyText: "Auto body" });

    const after = await emailVersions(projectId);
    expect(after).toHaveLength(3);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after[2]).toMatchObject({ versionNumber: 3, triggeredByUpdateVersion: 2, createdById: null });
  });

  it("keeps the update when drafting fails, and leaves the email flagged so the PM can regenerate", async () => {
    const projectId = await newProject("Draft Fails");
    await addUpdateAndFinish(projectId, "An update.", new Error("drafting failed"));

    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(1);
    expect(await emailVersions(projectId)).toHaveLength(1);
    const email = (await getOutputFreshness(projectId)).clarificationEmail!;
    expect(email).toMatchObject({ stale: true, canRegenerate: true });
  });

  it("still redrafts when summarising fails", async () => {
    const projectId = await newProject("Summary Fails");
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    await uploadKnowledgeItemAction(projectId, undefined, updateForm("An update."));
    mockParse.mockRejectedValueOnce(new Error("summary failed"));
    mockParse.mockResolvedValueOnce({ parsed_output: { subject: "Still drafted", bodyText: "Body" } });
    await flushAfterResponse();

    expect((await emailVersions(projectId)).map((v) => v.versionNumber)).toEqual([1, 2]);
  });
});

describe("nothing is sent automatically", () => {
  it("only ever stores a draft version — the app has no way to send email", async () => {
    const projectId = await newProject("Never Sent");
    await addUpdateAndFinish(projectId, "An update.", { subject: "Draft", bodyText: "Body" });

    // The redraft wrote a document version and nothing else outward-facing.
    expect(await emailVersions(projectId)).toHaveLength(2);
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { dependencies: Record<string, string> };
    const mailers = Object.keys(pkg.dependencies).filter((d) =>
      /nodemailer|resend|sendgrid|postmark|mailgun|client-ses|mailchimp/i.test(d)
    );
    expect(mailers).toEqual([]);
    const redraftModule = readFileSync("src/lib/outputRegeneration.ts", "utf-8");
    expect(redraftModule).not.toMatch(/\bfetch\(|smtp|sendMail/i);
  });
});
