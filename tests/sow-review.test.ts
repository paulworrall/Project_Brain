import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addEstimateVersion, createEstimate } from "./helpers/estimates";

// Integration test for the PM-validated SOW content flow — real Server
// Actions and DB layer against the real dev database; only Anthropic,
// revalidatePath and auth are mocked (the same convention as
// sow-generation.test.ts). Covers: extraction on a first generation, the
// edit / add / exclude / revert / delete rules, optimistic concurrency, resume
// at the saved step, the regeneration merge rules, composition using only
// included items, and the snapshot stored on the SOW version.

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

const { startSowDevelopmentAction, generateSowAction } = await import(
  "@/app/(dashboard)/projects/[projectId]/actions"
);
const {
  startSowReviewAction,
  saveSowReviewStepAction,
  saveSowItemAction,
  revertSowItemAction,
  acceptSowSuggestionAction,
  dismissSowSuggestionAction,
  addSowItemAction,
  deleteSowItemAction,
} = await import("@/app/(dashboard)/projects/[projectId]/sow-review-actions");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowReviewSpec";

let hubId: string;
let clientId: string;
let workstreamId: string;
let templateId: string;
let templateVersionId: string;

const narrative = {
  scopeSummary: { objectives: ["Relaunch the app"], background: "Background." },
  milestones: [],
  rolesAndResponsibilities: [],
};

const firstExtraction = {
  newItems: [
    { section: "DELIVERABLES", text: "Rewards app" },
    { section: "DELIVERABLES", text: "Referral programme" },
    { section: "DELIVERABLES", text: "Loyalty dashboard" },
    { section: "SERVICES", text: "Experience/Creative — app design" },
    { section: "ASSUMPTIONS", text: "UK market only" },
    { section: "OUT_OF_SCOPE", text: "Legacy migration" },
    { section: "RISKS", text: "Tight timeline" },
  ],
  changes: [],
};

async function createProject(name: string): Promise<string> {
  const project = await prisma.project.create({ data: { name, workstreamId } });
  await prisma.briefAttributeValue.createMany({
    data: [
      { attributeId: "budget", values: { amount: "$90k" } },
      { attributeId: "objective", values: { objective: "Relaunch", successMeasures: "More actives" } },
      { attributeId: "timeline", values: { startDate: "2026-10-01" } },
      { attributeId: "clientContact", values: { name: "Caroline", email: "caroline@fizzy.example" } },
    ].map((row) => ({ ...row, projectId: project.id, kind: "CONFIRMED" as const, source: "PM_ENTRY" as const })),
  });
  const form = new FormData();
  form.set("sowTemplateId", templateId);
  form.set("sowTemplateVersionId", templateVersionId);
  await startSowDevelopmentAction(project.id, undefined, form);
  const estimate = await createEstimate(prisma, { projectId: project.id, clientId, label: "Main" });
  await addEstimateVersion(prisma, { ...estimate, versionNumber: 1, total: 50000 });
  return project.id;
}

async function itemByText(projectId: string, text: string) {
  return prisma.sowSectionItem.findFirstOrThrow({ where: { projectId, text } });
}

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowReviewSpecClient", hubId } });
  clientId = client.id;
  const workstream = await prisma.workstream.create({ data: { name: "SowReviewSpecWorkstream", clientId } });
  workstreamId = workstream.id;
  const template = await prisma.sOWTemplate.create({
    data: { name: "Review Spec Template", scope: "CLIENT_SPECIFIC", clientId, isBaseline: false },
  });
  templateId = template.id;
  const version = await prisma.sOWTemplateVersion.create({
    data: {
      sowTemplateId: template.id,
      versionNumber: 1,
      fileName: "template.docx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "Overview, Scope, Fees.",
    },
  });
  templateVersionId = version.id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { project: { workstreamId } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
});

describe("first generation: extraction, review, composition", () => {
  let projectId: string;
  let rewardsApp: { id: string; version: number };

  beforeAll(async () => {
    projectId = await createProject("First Generation");
  });

  it("refuses to start the review until the brief gate passes, without calling the agent", async () => {
    const bare = await prisma.project.create({ data: { name: "No Key Details", workstreamId } });
    const form = new FormData();
    form.set("sowTemplateId", templateId);
    form.set("sowTemplateVersionId", templateVersionId);
    await startSowDevelopmentAction(bare.id, undefined, form);

    const result = await startSowReviewAction(bare.id);

    expect(result.missingAttributes?.length).toBeGreaterThan(0);
    expect(result.items).toBeUndefined();
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("extraction creates an AGENT item per proposal, all included, in order, not flagged as new", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: firstExtraction });

    const result = await startSowReviewAction(projectId);

    expect(result.items).toHaveLength(7);
    const deliverables = result.items!.filter((i) => i.section === "DELIVERABLES");
    expect(deliverables.map((i) => [i.text, i.position])).toEqual([
      ["Rewards app", 0],
      ["Referral programme", 1],
      ["Loyalty dashboard", 2],
    ]);
    for (const item of result.items!) {
      expect(item.source).toBe("AGENT");
      expect(item.included).toBe(true);
      expect(item.agentOriginalText).toBe(item.text);
      expect(item.isNewSinceLastReview).toBe(false);
      expect(item.pendingAgentSuggestion).toBeNull();
    }
    expect(result.currentStep).toBe(0);
    // The extraction prompt carried the project context, not existing items.
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockParse.mock.calls[0][0].messages[0].content).not.toContain("<existing_items>");
    const row = await itemByText(projectId, "Rewards app");
    rewardsApp = { id: row.id, version: row.version };
  });

  it("reopening a review in progress resumes it — no second extraction", async () => {
    const result = await startSowReviewAction(projectId);

    expect(result.items).toHaveLength(7);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("editing an AGENT item makes it PM_EDITED and keeps the agent's wording", async () => {
    const result = await saveSowItemAction(projectId, rewardsApp.id, { text: "Rewards app (iOS + Android)" }, rewardsApp.version);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.source).toBe("PM_EDITED");
    expect(result.item.text).toBe("Rewards app (iOS + Android)");
    expect(result.item.agentOriginalText).toBe("Rewards app");
    expect(result.item.version).toBe(rewardsApp.version + 1);
    rewardsApp.version = result.item.version;
  });

  it("'Revert to suggestion' restores the agent's wording and the AGENT source; then re-edit", async () => {
    const reverted = await revertSowItemAction(projectId, rewardsApp.id, rewardsApp.version);
    expect(reverted.ok && reverted.item).toMatchObject({ text: "Rewards app", source: "AGENT" });
    if (!reverted.ok) return;

    const edited = await saveSowItemAction(projectId, rewardsApp.id, { text: "Rewards app (iOS + Android)" }, reverted.item.version);
    expect(edited.ok && edited.item.source).toBe("PM_EDITED");
    if (edited.ok) rewardsApp.version = edited.item.version;
  });

  it("typing the agent's exact wording back makes an edited item an AGENT item again", async () => {
    const back = await saveSowItemAction(projectId, rewardsApp.id, { text: "Rewards app" }, rewardsApp.version);
    expect(back.ok && back.item.source).toBe("AGENT");
    if (!back.ok) return;
    const again = await saveSowItemAction(projectId, rewardsApp.id, { text: "Rewards app (iOS + Android)" }, back.item.version);
    if (again.ok) rewardsApp.version = again.item.version;
  });

  it("refuses to empty a suggested item (exclude it instead)", async () => {
    const result = await saveSowItemAction(projectId, rewardsApp.id, { text: "   " }, rewardsApp.version);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
  });

  it("excluding persists and keeps the item visible in the data", async () => {
    const dashboard = await itemByText(projectId, "Loyalty dashboard");
    const result = await saveSowItemAction(projectId, dashboard.id, { included: false }, dashboard.version);

    expect(result.ok && result.item.included).toBe(false);
    const reloaded = await startSowReviewAction(projectId);
    expect(reloaded.items!.find((i) => i.text === "Loyalty dashboard")?.included).toBe(false);
  });

  it("adding creates a blank PM_ADDED item at the end of the section; saving text keeps it PM_ADDED", async () => {
    const added = await addSowItemAction(projectId, "DELIVERABLES");
    expect(added).toMatchObject({ source: "PM_ADDED", text: "", included: true, position: 3, agentOriginalText: null });

    const saved = await saveSowItemAction(projectId, added!.id, { text: "Training workshop" }, added!.version);
    expect(saved.ok && saved.item).toMatchObject({ text: "Training workshop", source: "PM_ADDED" });
  });

  it("only PM_ADDED items can be deleted; agent items can only be excluded", async () => {
    const mine = await itemByText(projectId, "Training workshop");
    const agents = await itemByText(projectId, "Tight timeline");

    const refused = await deleteSowItemAction(projectId, agents.id, agents.version);
    expect(refused.ok).toBe(false);
    expect(await prisma.sowSectionItem.count({ where: { id: agents.id } })).toBe(1);

    expect((await deleteSowItemAction(projectId, mine.id, mine.version)).ok).toBe(true);
    expect(await prisma.sowSectionItem.count({ where: { id: mine.id } })).toBe(0);
  });

  it("a stale write is a conflict, returns the current item, and changes nothing", async () => {
    const result = await saveSowItemAction(projectId, rewardsApp.id, { text: "Stale overwrite" }, rewardsApp.version - 1);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("conflict");
    expect(result.item?.text).toBe("Rewards app (iOS + Android)");
    expect((await itemByText(projectId, "Rewards app (iOS + Android)")).id).toBe(rewardsApp.id);
  });

  it("items are scoped to their project: another project cannot read or edit them by id", async () => {
    const other = await prisma.project.create({ data: { name: "Other Project", workstreamId } });

    const result = await saveSowItemAction(other.id, rewardsApp.id, { text: "Hijacked" }, rewardsApp.version);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
    expect((await prisma.sowSectionItem.findUniqueOrThrow({ where: { id: rewardsApp.id } })).text).toBe(
      "Rewards app (iOS + Android)"
    );
  });

  it("Save & exit resumes at the saved step", async () => {
    await saveSowReviewStepAction(projectId, 3);

    const resumed = await startSowReviewAction(projectId);

    expect(resumed.currentStep).toBe(3);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("composition uses only the included, non-blank items, in position order, and snapshots them on the version", async () => {
    // A blank PM_ADDED item must be ignored too.
    await addSowItemAction(projectId, "RISKS");
    mockParse.mockResolvedValueOnce({ parsed_output: narrative });

    const result = await generateSowAction(projectId, undefined, new FormData());
    expect(result?.message).toBeUndefined();

    const version = await prisma.sOWVersion.findFirstOrThrow({ where: { sow: { projectId } } });
    const body = (version.content as { body: Record<string, unknown> }).body;
    expect(body.deliverables).toEqual(["Rewards app (iOS + Android)", "Referral programme"]);
    expect(body.services).toEqual(["Experience/Creative — app design"]);
    expect(body.assumptions).toEqual(["UK market only"]);
    expect(body.outOfScope).toEqual(["Legacy migration"]);
    expect(body.risks).toEqual(["Tight timeline"]);
    expect(JSON.stringify(version.content)).not.toContain("Loyalty dashboard");

    expect(version.itemsSnapshot).toEqual([
      { section: "DELIVERABLES", text: "Rewards app (iOS + Android)", position: 0, source: "PM_EDITED" },
      { section: "DELIVERABLES", text: "Referral programme", position: 1, source: "AGENT" },
      { section: "SERVICES", text: "Experience/Creative — app design", position: 0, source: "AGENT" },
      { section: "ASSUMPTIONS", text: "UK market only", position: 0, source: "AGENT" },
      { section: "OUT_OF_SCOPE", text: "Legacy migration", position: 0, source: "AGENT" },
      { section: "RISKS", text: "Tight timeline", position: 0, source: "AGENT" },
    ]);

    // The composition prompt saw the validated scope and not the excluded item.
    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Referral programme");
    expect(prompt).not.toContain("Loyalty dashboard");

    // The review is closed: reopening re-extracts.
    const state = await prisma.sowReviewState.findUniqueOrThrow({ where: { projectId } });
    expect(state).toMatchObject({ inProgress: false, currentStep: 0 });
    expect(state.lastCompletedAt).not.toBeNull();
  });

  describe("regeneration merge", () => {
    it("passes existing items with ids; never overwrites PM text; keeps excluded excluded; flags new; never deletes", async () => {
      // Make a PM_ADDED item and an untouched AGENT one to revise.
      const added = await addSowItemAction(projectId, "ASSUMPTIONS");
      await saveSowItemAction(projectId, added!.id, { text: "Client provides brand assets" }, added!.version);
      const before = await prisma.sowSectionItem.findMany({ where: { projectId } });

      const edited = await itemByText(projectId, "Rewards app (iOS + Android)");
      const excluded = await itemByText(projectId, "Loyalty dashboard");
      const untouched = await itemByText(projectId, "Referral programme");
      const pmAdded = await itemByText(projectId, "Client provides brand assets");

      mockParse.mockResolvedValueOnce({
        parsed_output: {
          newItems: [
            { section: "DELIVERABLES", text: "Analytics integration" },
            { section: "DELIVERABLES", text: "referral PROGRAMME" }, // an existing item restated: not new
          ],
          changes: [
            { itemId: edited.id, text: "Rewards app for iOS, Android and web" },
            { itemId: excluded.id, text: "Loyalty dashboard with live data" },
            { itemId: untouched.id, text: "Referral programme with tiered rewards" },
            { itemId: pmAdded.id, text: "Client supplies all brand assets" },
            { itemId: "not-a-real-item-id", text: "Ghost" },
          ],
        },
      });

      const result = await startSowReviewAction(projectId);

      const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("<existing_items>");
      expect(prompt).toContain(edited.id);

      const after = await prisma.sowSectionItem.findMany({ where: { projectId } });
      // Nothing deleted; exactly one genuinely new item.
      expect(after).toHaveLength(before.length + 1);

      const byId = new Map(after.map((i) => [i.id, i]));
      // PM_EDITED: text untouched, agent's change waits as a suggestion.
      expect(byId.get(edited.id)).toMatchObject({
        text: "Rewards app (iOS + Android)",
        source: "PM_EDITED",
        pendingAgentSuggestion: "Rewards app for iOS, Android and web",
      });
      // PM_ADDED: same.
      expect(byId.get(pmAdded.id)).toMatchObject({
        text: "Client provides brand assets",
        source: "PM_ADDED",
        pendingAgentSuggestion: "Client supplies all brand assets",
      });
      // Untouched AGENT item: takes the revised wording, no suggestion.
      expect(byId.get(untouched.id)).toMatchObject({
        text: "Referral programme with tiered rewards",
        source: "AGENT",
        pendingAgentSuggestion: null,
      });
      // Excluded stays excluded.
      expect(byId.get(excluded.id)?.included).toBe(false);
      // The new item is flagged.
      const created = after.find((i) => i.text === "Analytics integration");
      expect(created).toMatchObject({ source: "AGENT", included: true, isNewSinceLastReview: true, position: 3 });
      // The review is in progress again, at step 0.
      expect(result.currentStep).toBe(0);
      expect(result.items!.find((i) => i.id === edited.id)?.pendingAgentSuggestion).toBeTruthy();
    });

    it("accepting a suggestion applies it (an edited item becomes an agent item again); dismissing clears it", async () => {
      const edited = await itemByText(projectId, "Rewards app (iOS + Android)");
      const pmAdded = await itemByText(projectId, "Client provides brand assets");

      const accepted = await acceptSowSuggestionAction(projectId, edited.id, edited.version);
      expect(accepted.ok && accepted.item).toMatchObject({
        text: "Rewards app for iOS, Android and web",
        source: "AGENT",
        pendingAgentSuggestion: null,
        agentOriginalText: "Rewards app for iOS, Android and web",
      });

      const dismissed = await dismissSowSuggestionAction(projectId, pmAdded.id, pmAdded.version);
      expect(dismissed.ok && dismissed.item).toMatchObject({
        text: "Client provides brand assets",
        source: "PM_ADDED",
        pendingAgentSuggestion: null,
      });
    });

    it("a second SOW version snapshots the item set it was generated from, leaving the first untouched", async () => {
      mockParse.mockResolvedValueOnce({ parsed_output: narrative });
      expect((await generateSowAction(projectId, undefined, new FormData()))?.message).toBeUndefined();

      const versions = await prisma.sOWVersion.findMany({
        where: { sow: { projectId } },
        orderBy: { versionNumber: "asc" },
      });
      expect(versions).toHaveLength(2);
      const first = JSON.stringify(versions[0].itemsSnapshot);
      const second = JSON.stringify(versions[1].itemsSnapshot);
      expect(first).toContain("Rewards app (iOS + Android)");
      expect(first).not.toContain("Analytics integration");
      expect(second).toContain("Analytics integration");
      expect(second).toContain("Client provides brand assets");
      // "New since last review" flags are cleared once a SOW is generated.
      expect(await prisma.sowSectionItem.count({ where: { projectId, isNewSinceLastReview: true } })).toBe(0);
    });
  });
});

describe("deliverables minimum", () => {
  it("won't compose a SOW with no included deliverable, and never calls the agent", async () => {
    const projectId = await createProject("No Deliverables");
    mockParse.mockResolvedValueOnce({
      parsed_output: { newItems: [{ section: "RISKS", text: "Only a risk" }], changes: [] },
    });
    await startSowReviewAction(projectId);
    mockParse.mockClear();

    const result = await generateSowAction(projectId, undefined, new FormData());

    expect(result?.message).toMatch(/at least one deliverable/i);
    expect(mockParse).not.toHaveBeenCalled();
    expect(await prisma.sOWVersion.count({ where: { sow: { projectId } } })).toBe(0);
  });

  it("surfaces an extraction failure as a friendly message and leaves no half-finished review", async () => {
    const projectId = await createProject("Extraction Fails");
    mockParse.mockRejectedValueOnce(new Error("upstream down"));

    const result = await startSowReviewAction(projectId);

    expect(result.message).toBeTruthy();
    expect(result.items).toBeUndefined();
    expect(await prisma.sowSectionItem.count({ where: { projectId } })).toBe(0);
    expect(await prisma.sowReviewState.count({ where: { projectId } })).toBe(0);
  });
});
