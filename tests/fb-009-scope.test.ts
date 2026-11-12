import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration tests for FB-009 A (Scope summary): versioning, edits,
// confirming a version, the sent flag, updates creating new versions with
// their changed sections, the legacy merge and the generators' scope input.
// Claude is mocked at the SDK. Skipped (loudly) until the FB-009 migration is
// applied.

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
vi.unmock("@/app/(dashboard)/projects/[projectId]/scope-actions");

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");
const { appendScopeSummaryVersion, latestScopeSummary, scopeInputSection } =
  await import("@/lib/scopeSummary");
const { confirmScope, reopenScope, editScopeSummary, setClarificationSent } =
  await import("@/lib/project/stepService");
// FB-010: the old update action, through the new Add project information action.
const { uploadKnowledgeItemAction } = await import("./helpers/addInformation");
const { createScopeSummaryFromEarlierAction, regenerateScopeSummaryAction } =
  await import("@/app/(dashboard)/projects/[projectId]/scope-actions");
const { assembleSowContext } = await import("@/lib/sow-context");
const { afterResponseQueue } = await import("./helpers/afterResponse");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const migrated = (
  await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'Project' AND column_name = 'confirmedScopeVersionId'`
)[0]?.n;
const describeDb = migrated ? describe : describe.skip;
if (!migrated) {
  console.warn("[fb-009-scope] apply the 20261112100000 migration to run these tests.");
}

const STAMP = Date.now();
let hubId: string;
let workstreamId: string;
let pm: { id: string; role: "DELIVERY" };
let n = 0;

const v1 = {
  context: "Fizzy wants a summer launch.",
  outOfScope: [],
  deliverables: ["Campaign concept"],
  constraints: [],
  assumptions: [],
  openQuestions: ["Which markets?", "Budget split?"],
};

async function newProject(withScope = true) {
  n += 1;
  const project = await prisma.project.create({
    data: { name: `FB-009 Scope ${n}`, workstreamId, briefRawText: "Summer launch brief." },
  });
  if (withScope) await appendScopeSummaryVersion(project.id, v1, {}, prisma);
  return project.id;
}

beforeAll(async () => {
  if (!migrated) return;
  const hub = await prisma.hub.create({ data: { name: `TestHub_Fb009Scope_${STAMP}` } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "Fb009ScopeClient", hubId } });
  const ws = await prisma.workstream.create({
    data: { name: "Fb009ScopeWs", clientId: client.id },
  });
  workstreamId = ws.id;
  const user = await prisma.user.create({
    data: {
      name: "Pat PM",
      email: `pat-${STAMP}@fb009scope.test`,
      passwordHash: "x",
      role: "DELIVERY",
    },
  });
  pm = { id: user.id, role: "DELIVERY" };
  mockAuth.mockResolvedValue({ user: pm });
});

afterAll(async () => {
  if (migrated) {
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.delete({ where: { id: pm.id } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
  afterResponseQueue().length = 0;
});

describeDb("Scope summary versions", () => {
  it("appends versions; an edit saves a new version naming the changed sections", async () => {
    const projectId = await newProject();
    const latest = (await latestScopeSummary(projectId, prisma))!;
    expect(latest.versionNumber).toBe(1);

    const result = await editScopeSummary(prisma, pm, {
      projectId,
      baseVersionId: latest.id,
      content: { ...v1, deliverables: ["Campaign concept", "Social toolkit"] },
    });
    expect(result).toMatchObject({
      ok: true,
      data: { versionNumber: 2, changedSections: ["Deliverables"] },
    });

    // No change: no new version.
    const same = await editScopeSummary(prisma, pm, {
      projectId,
      baseVersionId: (await latestScopeSummary(projectId, prisma))!.id,
      content: { ...v1, deliverables: ["Campaign concept", "Social toolkit"] },
    });
    expect(same).toMatchObject({ ok: true, data: { versionNumber: 2, changedSections: [] } });
  });

  it("refuses an edit made against an older version", async () => {
    const projectId = await newProject();
    const old = (await latestScopeSummary(projectId, prisma))!;
    await appendScopeSummaryVersion(
      projectId,
      { ...v1, context: "Changed elsewhere." },
      {},
      prisma
    );
    const result = await editScopeSummary(prisma, pm, {
      projectId,
      baseVersionId: old.id,
      content: v1,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describeDb("confirming a version", () => {
  it("records the confirmed version; confirming again moves it to a newer version; reopen clears it", async () => {
    const projectId = await newProject();
    await confirmScope(prisma, pm, { projectId });
    const first = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const v1Row = (await latestScopeSummary(projectId, prisma))!;
    expect(first.confirmedScopeVersionId).toBe(v1Row.id);

    // Same version: idempotent.
    await confirmScope(prisma, pm, { projectId });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).scopeConfirmedAt
    ).toEqual(first.scopeConfirmedAt);

    const v2 = await appendScopeSummaryVersion(
      projectId,
      { ...v1, assumptions: ["New"] },
      {},
      prisma
    );
    await confirmScope(prisma, pm, { projectId });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).confirmedScopeVersionId
    ).toBe(v2.id);

    await reopenScope(prisma, pm, { projectId });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).confirmedScopeVersionId
    ).toBeNull();
  });

  it("the generators read the confirmed version, not a newer unconfirmed one", async () => {
    const projectId = await newProject();
    await confirmScope(prisma, pm, { projectId });
    await appendScopeSummaryVersion(
      projectId,
      { ...v1, context: "UNCONFIRMED_MARKER" },
      {},
      prisma
    );

    const scope = await scopeInputSection(projectId);
    expect(scope).toContain("Scope summary (confirmed, v1)");
    expect(scope).not.toContain("UNCONFIRMED_MARKER");
    const sow = await assembleSowContext(projectId);
    expect(sow.narrativeContext).toContain("Scope summary (confirmed, v1)");
    expect(sow.narrativeContext).not.toContain("UNCONFIRMED_MARKER");
  });

  it("a legacy project without a Scope summary still gives its Position Document", async () => {
    const projectId = await newProject(false);
    await prisma.document.create({
      data: {
        projectId,
        type: "POSITION_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: {
              whatWeKnow: [{ topic: "Audience", detail: "LEGACY_MARKER" }],
              clientFlaggedOpenItems: [],
            },
          },
        },
      },
    });
    expect(await scopeInputSection(projectId)).toContain("LEGACY_MARKER");
  });
});

describeDb("updates and the clarification email", () => {
  it("an update creates a new Scope summary version and says which sections changed", async () => {
    const projectId = await newProject();
    mockParse
      // 1. update the Scope summary (answers "Which markets?")
      .mockResolvedValueOnce({ parsed_output: { ...v1, openQuestions: ["Budget split?"] } })
      // 2. key details read from the update
      .mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    const form = new FormData();
    form.set("content", "UK launches first.");
    const result = await uploadKnowledgeItemAction(projectId, undefined, form);
    expect(result?.message).toBeUndefined();

    const latest = (await latestScopeSummary(projectId, prisma))!;
    expect(latest.versionNumber).toBe(2);
    expect(latest.content.openQuestions).toEqual(["Budget split?"]);
    // No Position Document is written for a project with a Scope summary.
    expect(await prisma.document.count({ where: { projectId, type: "POSITION_DOCUMENT" } })).toBe(
      0
    );
    // The email redraft is queued while the email isn't marked as sent.
    expect(afterResponseQueue().length).toBe(2);
  });

  it("after Mark as sent, updates no longer queue an automatic email redraft", async () => {
    const projectId = await newProject();
    expect(await setClarificationSent(prisma, pm, { projectId, sent: true })).toMatchObject({
      ok: true,
    });
    mockParse
      .mockResolvedValueOnce({ parsed_output: v1 })
      .mockResolvedValueOnce({ parsed_output: keyAttributeFacts() });
    const form = new FormData();
    form.set("content", "Nothing new really.");
    const result = await uploadKnowledgeItemAction(projectId, undefined, form);
    expect(result?.notice).not.toMatch(/client email draft/);
    // Only the AI summary is queued.
    expect(afterResponseQueue().length).toBe(1);

    await setClarificationSent(prisma, pm, { projectId, sent: false });
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).clarificationSentAt
    ).toBeNull();
  });
});

describeDb("agent actions", () => {
  it("creates v1 from a legacy project's earlier documents, only once", async () => {
    const projectId = await newProject(false);
    await prisma.document.create({
      data: {
        projectId,
        type: "POSITION_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: { whatWeKnow: [], clientFlaggedOpenItems: ["TBC"] },
          },
        },
      },
    });
    mockParse.mockResolvedValueOnce({ parsed_output: v1 });
    expect(await createScopeSummaryFromEarlierAction(projectId)).toMatchObject({
      ok: true,
      data: { versionNumber: 1 },
    });
    expect(mockParse.mock.calls[0][0].messages[0].content).toContain("## Position Document (v1)");
    expect(await createScopeSummaryFromEarlierAction(projectId)).toMatchObject({ ok: false });
  });

  it("regenerate appends a version from everything known", async () => {
    const projectId = await newProject();
    mockParse.mockResolvedValueOnce({ parsed_output: { ...v1, context: "Regenerated." } });
    expect(await regenerateScopeSummaryAction(projectId)).toMatchObject({
      ok: true,
      data: { versionNumber: 2 },
    });
    expect((await latestScopeSummary(projectId, prisma))!.content.context).toBe("Regenerated.");
  });
});
