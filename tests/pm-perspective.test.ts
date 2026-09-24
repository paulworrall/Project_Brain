import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration test for the PM perspective: captured at intake (or
// not — it's optional), stored separately from the brief, editable later
// with who/when recorded, handed to agents as its own labelled block, and
// linked to key attributes only as a PM-entry suggestion. Only Anthropic,
// next/cache, next/navigation and auth are mocked.

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

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const { createProjectAction } = await import("@/app/(dashboard)/projects/new/actions");
const { suggestCapabilitiesAction, updatePmPerspectiveFieldAction, uploadKnowledgeItemAction } =
  await import("@/app/(dashboard)/projects/[projectId]/actions");
const { getPmPerspective } = await import("@/lib/pmPerspectiveStore");
const { getBriefCompleteness } = await import("@/lib/briefCompleteness");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_PmPerspectiveSpec";
const BRIEF = "CLIENT_BRIEF_MARKER: Relaunch the loyalty app. Budget £50k.";

let hubId: string;
let workstreamId: string;
let msaId: string;
let pmUserId: string;

const positionFields = {
  whatWeKnow: [{ topic: "Objective", detail: "Relaunch the loyalty app" }],
  whatWeNeedToFindOut: [],
  clientFlaggedOpenItems: [],
};

const noKeyAttributes = { facts: [] };

/** Intake order: classify, key details, Position Document, email. */
function queueIntakeCalls() {
  mockParse
    .mockResolvedValueOnce({ parsed_output: { briefType: "WORD_DOC", summary: "A brief." } })
    .mockResolvedValueOnce({ parsed_output: noKeyAttributes })
    .mockResolvedValueOnce({ parsed_output: positionFields })
    .mockResolvedValueOnce({ parsed_output: { subject: "Questions", bodyText: "Hi," } });
}

function createFormData(name: string, pm: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("workstreamId", workstreamId);
  formData.set("name", name);
  formData.set("masterServiceAgreementId", msaId);
  formData.set("briefText", BRIEF);
  for (const [fieldId, value] of Object.entries(pm)) {
    formData.set(`pm_${fieldId}`, value);
  }
  return formData;
}

async function createProject(name: string, pm: Record<string, string> = {}) {
  queueIntakeCalls();
  await expect(createProjectAction(undefined, createFormData(name, pm))).rejects.toThrow(
    "NEXT_REDIRECT_MOCK"
  );
  return prisma.project.findUniqueOrThrow({ where: { workstreamId_name: { workstreamId, name } } });
}

function promptOf(callIndex: number): string {
  return mockParse.mock.calls[callIndex][0].messages[0].content as string;
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "PmPerspectiveSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "PmPerspectiveSpecWorkstream", clientId: client.id },
  });
  workstreamId = workstream.id;
  const msa = await prisma.masterServiceAgreement.create({
    data: {
      clientId: client.id,
      versions: {
        create: {
          versionNumber: 1,
          fileName: "msa.txt",
          fileBytes: Buffer.from("dummy"),
          extractedText: "dummy",
          effectiveFrom: new Date("2026-01-01"),
          status: "ENABLED",
        },
      },
    },
  });
  msaId = msa.id;
  const pmUser = await prisma.user.create({
    data: {
      name: "Pat PM",
      email: `pat.pm.${Date.now()}@pm-perspective-spec.example`,
      passwordHash: "not-a-real-hash",
      role: "CLIENT_ENGAGEMENT",
    },
  });
  pmUserId = pmUser.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.user.delete({ where: { id: pmUserId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
  mockAuth.mockResolvedValue({ user: { id: pmUserId } });
});

describe("PM perspective at intake", () => {
  it("lets a project be created with the PM perspective left empty", async () => {
    const project = await createProject("Empty PM Perspective Project");

    expect(await prisma.pmPerspectiveEntry.count({ where: { projectId: project.id } })).toBe(0);
    for (let i = 0; i < mockParse.mock.calls.length; i++) {
      expect(promptOf(i)).not.toContain("<pm_perspective>");
    }
    const pm = await getPmPerspective(project.id);
    expect(pm.every((field) => field.content === "")).toBe(true);
  });

  it("stores the PM perspective separately from the brief, recording who entered each field and when", async () => {
    const before = new Date();
    const project = await createProject("Filled PM Perspective Project", {
      initialThoughts: "PM_THOUGHTS_MARKER: ambitious for a pilot",
      proposedSolution: "PM_SOLUTION_MARKER: phased rollout",
    });

    expect(project.briefRawText).toBe(BRIEF);
    expect(project.briefRawText).not.toContain("PM_");

    const entries = await prisma.pmPerspectiveEntry.findMany({ where: { projectId: project.id } });
    expect(entries.map((e) => e.fieldId).sort()).toEqual(["initialThoughts", "proposedSolution"]);
    for (const entry of entries) {
      expect(entry.updatedById).toBe(pmUserId);
      expect(entry.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    }

    const pm = await getPmPerspective(project.id);
    const thoughts = pm.find((f) => f.id === "initialThoughts")!;
    expect(thoughts).toMatchObject({ label: "Initial thoughts", updatedByName: "Pat PM" });
    expect(thoughts.content).toContain("PM_THOUGHTS_MARKER");
  });

  it("passes the PM perspective to the Position Document and email as a labelled block — but never to key-attribute extraction", async () => {
    await createProject("Prompt PM Perspective Project", {
      initialThoughts: "PM_CONTEXT_MARKER: known client",
    });

    const [classify, keyAttributes, position, email] = [0, 1, 2, 3].map(promptOf);
    expect(classify).not.toContain("PM_CONTEXT_MARKER");
    expect(position).toContain("<pm_perspective>");
    expect(position).toContain("PM_CONTEXT_MARKER");
    expect(email).toContain("<pm_perspective>");
    // Budget, timeline and client contact must come from the client.
    expect(keyAttributes).toContain("CLIENT_BRIEF_MARKER");
    expect(keyAttributes).not.toContain("PM_CONTEXT_MARKER");
  });

  it("never turns PM perspective content into a key detail — key details come only from the client", async () => {
    const project = await createProject("No Key Details From PM Project", {
      initialThoughts: "Budget is probably £80k, starting in October, run by Caroline.",
      proposedSolution: "Success = 20% more monthly actives.",
    });

    expect(await prisma.briefAttributeValue.count({ where: { projectId: project.id } })).toBe(0);
    const completeness = await getBriefCompleteness(project.id);
    expect(completeness.attributes.every((a) => a.pmSuggestion === null)).toBe(true);
  });
});

describe("editing the PM perspective after intake", () => {
  it("saves an edit, recording the new time and author", async () => {
    const project = await createProject("Edit PM Perspective Project", {
      initialThoughts: "First read: straightforward.",
    });
    const original = await prisma.pmPerspectiveEntry.findUniqueOrThrow({
      where: { projectId_fieldId: { projectId: project.id, fieldId: "initialThoughts" } },
    });

    const otherUser = await prisma.user.create({
      data: {
        name: "Sam Second",
        email: `sam.${Date.now()}@pm-perspective-spec.example`,
        passwordHash: "x",
        role: "DELIVERY",
      },
    });
    try {
      mockAuth.mockResolvedValue({ user: { id: otherUser.id } });
      const content = new FormData();
      content.set("content", "Second read: more complex than it looks.");
      const result = await updatePmPerspectiveFieldAction(
        project.id,
        "initialThoughts",
        undefined,
        content
      );
      expect(result?.message).toBeUndefined();

      const updated = await prisma.pmPerspectiveEntry.findUniqueOrThrow({
        where: { projectId_fieldId: { projectId: project.id, fieldId: "initialThoughts" } },
      });
      expect(updated.content).toBe("Second read: more complex than it looks.");
      expect(updated.updatedById).toBe(otherUser.id);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
      const view = (await getPmPerspective(project.id)).find((f) => f.id === "initialThoughts")!;
      expect(view.updatedByName).toBe("Sam Second");
    } finally {
      await prisma.pmPerspectiveEntry.updateMany({
        where: { updatedById: otherUser.id },
        data: { updatedById: null },
      });
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
  });

  it("adds a field that was left empty at intake", async () => {
    const project = await createProject("Add Later Project");
    const content = new FormData();
    content.set("content", "Start with one partner in one market.");
    await updatePmPerspectiveFieldAction(project.id, "proposedSolution", undefined, content);

    const view = (await getPmPerspective(project.id)).find((f) => f.id === "proposedSolution")!;
    expect(view.content).toBe("Start with one partner in one market.");
    expect(view.updatedByName).toBe("Pat PM");
  });

  it("rejects an unknown field", async () => {
    const project = await createProject("Unknown Field Project");
    const content = new FormData();
    content.set("content", "x");
    const result = await updatePmPerspectiveFieldAction(
      project.id,
      "notAField",
      undefined,
      content
    );
    expect(result?.message).toMatch(/unknown/i);
  });

  it("rejects the fields that were removed (Context, Consultancy guidance, Early KPIs)", async () => {
    const project = await createProject("Removed Fields Project");
    const content = new FormData();
    content.set("content", "x");
    for (const fieldId of ["context", "consultancyGuidance", "earlyKpis"]) {
      const result = await updatePmPerspectiveFieldAction(project.id, fieldId, undefined, content);
      expect(result?.message).toMatch(/unknown/i);
    }
    expect(await prisma.pmPerspectiveEntry.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe("the PM perspective in later agent prompts", () => {
  it("is given to the Position Document update on each Additional Input as its own block", async () => {
    const project = await createProject("Upload Context Project", {
      initialThoughts: "PM_CONTEXT_MARKER",
    });
    mockParse.mockReset();
    mockParse
      .mockResolvedValueOnce({ parsed_output: positionFields })
      .mockResolvedValueOnce({ parsed_output: noKeyAttributes });

    const formData = new FormData();
    formData.set("title", "Call notes");
    formData.set("content", "CLIENT_REPLY_MARKER");
    await uploadKnowledgeItemAction(project.id, undefined, formData);

    expect(promptOf(0)).toContain("<pm_perspective>");
    expect(promptOf(0)).toContain("PM_CONTEXT_MARKER");
    // Key-attribute extraction reads only the client's input.
    expect(promptOf(1)).toContain("CLIENT_REPLY_MARKER");
    expect(promptOf(1)).not.toContain("PM_CONTEXT_MARKER");
  });

  it("is included, labelled as the PM's view, in the specialist-brief context", async () => {
    const project = await createProject("Specialist Context Project", {
      proposedSolution: "PM_SOLUTION_MARKER",
    });
    mockParse.mockReset();
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [], isLowConfidence: false, lowConfidenceReason: null },
    });

    await suggestCapabilitiesAction(project.id, undefined, new FormData());

    const prompt = promptOf(0);
    expect(prompt).toContain("<pm_perspective>");
    expect(prompt).toContain("PM_SOLUTION_MARKER");
    expect(prompt).toMatch(/never present anything in it as something the client said/i);
  });
});
