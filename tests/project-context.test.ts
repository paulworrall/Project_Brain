import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Phase 3: one project context for every agent. Real DB; only the Anthropic
// SDK, next/cache and auth are mocked.

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
const { getProjectContext } = await import("@/lib/projectContext");
const { assembleSowContext } = await import("@/lib/sow-context");
const { assembleProjectContext } = await import("@/services/agents/chatbot");
const {
  uploadKnowledgeItemAction,
  suggestCapabilitiesAction,
  submitSpecialistFeedbackAction,
  regenerateClarificationEmailAction,
} = await import("@/app/(dashboard)/projects/[projectId]/actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_ProjectContextSpec";

let hubId: string;
let workstreamId: string;

const positionFields = {
  whatWeKnow: [{ topic: "Audience", detail: "Existing loyalty members." }],
  clientFlaggedOpenItems: ["Which markets"],
};

const estimateBrief = {
  projectOverview: { context: "A relaunch.", whatIsKnown: ["Budget £90k"], constraints: [] },
  capabilitySections: [{ capability: "TECH_AND_DATA" as const, whatIsExpected: ["Estimate the build"] }],
};

function promptOf(callIndex: number): string {
  return JSON.stringify(mockParse.mock.calls[callIndex][0].messages);
}

function updateForm(content: string, source?: string): FormData {
  const formData = new FormData();
  formData.set("content", content);
  if (source) formData.set("source", source);
  return formData;
}

/** A project with a brief, a PM perspective, a Position Document and two updates (v2 client, v3 internal). */
async function projectWithHistory(name: string, { positionDocument = true } = {}): Promise<string> {
  const project = await prisma.project.create({
    data: { name, workstreamId, briefRawText: `BRIEF_MARKER_${name}: relaunch the loyalty app.` },
  });
  await prisma.pmPerspectiveEntry.create({
    data: { projectId: project.id, fieldId: "initialThoughts", content: `PM_MARKER_${name}` },
  });
  if (positionDocument) {
    await prisma.document.create({
      data: {
        projectId: project.id,
        type: "POSITION_DOCUMENT",
        versions: { create: { versionNumber: 1, stageNumber: 1, content: positionFields } },
      },
    });
  }
  await prisma.knowledgeItem.createMany({
    data: [
      {
        projectId: project.id,
        type: "NOTE",
        content: `EARLIER_UPDATE_${name}`,
        versionNumber: 2,
        uploadedAt: new Date("2026-09-01T10:00:00Z"),
      },
      {
        projectId: project.id,
        type: "NOTE",
        content: `LATEST_UPDATE_${name}`,
        versionNumber: 3,
        source: "INTERNAL_TEAM",
        uploadedAt: new Date("2026-09-02T10:00:00Z"),
      },
    ],
  });
  await prisma.briefAttributeValue.create({
    data: {
      projectId: project.id,
      attributeId: "budget",
      kind: "SUGGESTION",
      source: "BRIEF",
      values: { amount: "£90k" },
    },
  });
  return project.id;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "ContextSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "ContextSpecWorkstream", clientId: client.id },
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

describe("getProjectContext", () => {
  it("assembles the brief, every update in version order with its source, the PM's view and key details with status", async () => {
    const projectId = await projectWithHistory("Full");

    const context = await getProjectContext(projectId);

    expect(context.latestVersion).toBe(3);
    const text = context.text;
    expect(text).toContain("BRIEF_MARKER_Full");
    expect(text).toContain("EARLIER_UPDATE_Full");
    expect(text).toContain("LATEST_UPDATE_Full");
    expect(text.indexOf("BRIEF_MARKER_Full")).toBeLessThan(text.indexOf("EARLIER_UPDATE_Full"));
    expect(text.indexOf("EARLIER_UPDATE_Full")).toBeLessThan(text.indexOf("LATEST_UPDATE_Full"));
    expect(text).toMatch(/v2 — .*from the client/);
    expect(text).toMatch(/v3 — .*from our internal team/);
    expect(text).toContain("<pm_perspective>");
    expect(text).toContain("PM_MARKER_Full");
    expect(text).toMatch(/Budget — captured \(from the brief\): Budget: £90k/);
    expect(text).toMatch(/Client Contact — missing/);
  });

  it("never includes another project's data, even under the same client", async () => {
    const mine = await projectWithHistory("Mine");
    await projectWithHistory("Theirs");

    const { text } = await getProjectContext(mine);

    expect(text).toContain("LATEST_UPDATE_Mine");
    expect(text).not.toContain("Theirs");
  });
});

describe("every agent builds its context from getProjectContext", () => {
  it("capabilities and the Estimate Brief see every update — even with no Position Document", async () => {
    const projectId = await projectWithHistory("Capabilities", { positionDocument: false });
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [], isLowConfidence: false, lowConfidenceReason: null },
    });

    await suggestCapabilitiesAction(projectId, undefined, new FormData());

    expect(promptOf(0)).toContain("BRIEF_MARKER_Capabilities");
    expect(promptOf(0)).toContain("LATEST_UPDATE_Capabilities");
    expect(promptOf(0)).toContain("PM_MARKER_Capabilities");
  });

  it("the SOW sees the latest update and the PM's view", async () => {
    const projectId = await projectWithHistory("Sow");

    const { narrativeContext } = await assembleSowContext(projectId);

    expect(narrativeContext).toContain("LATEST_UPDATE_Sow");
    expect(narrativeContext).toContain("PM_MARKER_Sow");
    expect(narrativeContext).toContain("<pm_perspective>");
  });

  it("Ask me anything answers from the brief and the latest update, each once", async () => {
    const projectId = await projectWithHistory("Chat");
    await prisma.touchpointNote.create({
      data: { projectId, type: "CLARIFICATION_REPLY", content: "LATEST_UPDATE_Chat (old duplicate copy)" },
    });

    const context = await assembleProjectContext(projectId);

    expect(context).toContain("BRIEF_MARKER_Chat");
    expect(context.split("LATEST_UPDATE_Chat").length - 1).toBe(1);
    expect(context).toContain("PM_MARKER_Chat");
  });

  it("the Position Document refresh on a new update sees the brief and earlier updates too", async () => {
    const projectId = await projectWithHistory("Refresh");
    mockParse.mockResolvedValueOnce({ parsed_output: positionFields });
    mockParse.mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });

    await uploadKnowledgeItemAction(projectId, undefined, updateForm("NEWEST_UPDATE_Refresh"));

    const refreshPrompt = promptOf(0);
    expect(refreshPrompt).toContain("NEWEST_UPDATE_Refresh");
    expect(refreshPrompt).toContain("BRIEF_MARKER_Refresh");
    expect(refreshPrompt).toContain("LATEST_UPDATE_Refresh");
  });

  it("specialist review sees the latest update alongside the Estimate Brief", async () => {
    const projectId = await projectWithHistory("Specialist");
    await prisma.estimateBrief.create({
      data: {
        projectId,
        versions: {
          create: {
            versionNumber: 1,
            fileName: "brief.docx",
            fileBytes: new Uint8Array([80, 75]),
            content: estimateBrief,
            capabilities: ["TECH_AND_DATA"],
          },
        },
      },
    });
    const specialistReview = await prisma.stage.findUniqueOrThrow({ where: { number: 5 } });
    await prisma.projectStageStatus.create({
      data: { projectId, stageId: specialistReview.id, status: "IN_PROGRESS" },
    });
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        deliverables: [],
        services: {
          experienceCreative: { involvement: "Not required." },
          business: { involvement: "Not required." },
          architecture: { involvement: "Not required." },
          techAndData: { involvement: "Build." },
          orchestration: { involvement: "Not required." },
          other: { involvement: "Not required.", label: "Other" },
        },
        openQuestionsRisks: [],
        outstandingGapsCarriedForward: [],
      },
    });
    const feedback = new FormData();
    feedback.set("feedback", "Looks right.");
    feedback.set("capability", "TECH_AND_DATA");

    await submitSpecialistFeedbackAction(projectId, undefined, feedback);

    expect(promptOf(0)).toContain("LATEST_UPDATE_Specialist");
    expect(promptOf(0)).toContain("<estimate_brief>");
  });

  it("the clarification email redraft sees the latest context", async () => {
    const projectId = await projectWithHistory("Email");
    mockParse.mockResolvedValueOnce({
      parsed_output: { subject: "Quick questions", bodyText: "Hi," },
    });

    await regenerateClarificationEmailAction(projectId, undefined, new FormData());

    expect(promptOf(0)).toContain("LATEST_UPDATE_Email");
  });
});

describe("no agent reads the brief or updates on its own", () => {
  // The only modules allowed to read the raw brief / updates directly. Every
  // other context goes through getProjectContext.
  const ALLOWED = new Set(
    [
      "src/lib/projectContext.ts", // the one context builder
      "src/lib/updateVersions.ts", // versions (and the change-summary "before" text)
      "src/lib/keyAttributeSources.ts", // re-reads each source on its own, latest wins
      "src/lib/briefCompleteness.ts", // update ids → version numbers only
      "src/app/(dashboard)/projects/new/actions.ts", // intake: the brief is all there is yet
    ].map((p) => path.normalize(p))
  );

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (full.includes(path.normalize("src/generated"))) return [];
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it("keeps direct brief/update reads to the allowed modules", () => {
    const offenders = sourceFiles("src").filter((file) => {
      if (ALLOWED.has(path.normalize(file))) return false;
      const code = readFileSync(file, "utf-8");
      return /briefRawText|knowledgeItem\.find|CLARIFICATION_REPLY/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
