import { describe, expect, it } from "vitest";
import { planExtractionMerge } from "@/lib/sowItemsMerge";
import type { SowItemDto } from "@/lib/sowReview";

function item(overrides: Partial<SowItemDto> & Pick<SowItemDto, "id">): SowItemDto {
  return {
    section: "DELIVERABLES",
    text: "Original wording",
    agentOriginalText: "Original wording",
    source: "AGENT",
    included: true,
    position: 0,
    isNewSinceLastReview: false,
    pendingAgentSuggestion: null,
    version: 0,
    ...overrides,
  };
}

describe("planExtractionMerge", () => {
  describe("first generation (no items exist)", () => {
    it("creates every proposed item, in order per section, not flagged as new-since-last-review", () => {
      const plan = planExtractionMerge([], {
        newItems: [
          { section: "DELIVERABLES", text: "App" },
          { section: "RISKS", text: "Timeline risk" },
          { section: "DELIVERABLES", text: "Referral programme" },
        ],
        changes: [],
      });

      expect(plan.creates).toEqual([
        { section: "DELIVERABLES", text: "App", position: 0, isNewSinceLastReview: false },
        { section: "RISKS", text: "Timeline risk", position: 0, isNewSinceLastReview: false },
        { section: "DELIVERABLES", text: "Referral programme", position: 1, isNewSinceLastReview: false },
      ]);
      expect(plan.updates).toEqual([]);
    });

    it("drops blanks and duplicates within the response", () => {
      const plan = planExtractionMerge([], {
        newItems: [
          { section: "SERVICES", text: "  Design  " },
          { section: "SERVICES", text: "design" },
          { section: "SERVICES", text: "   " },
        ],
        changes: [],
      });
      expect(plan.creates.map((c) => c.text)).toEqual(["Design"]);
    });
  });

  describe("regeneration", () => {
    it("flags genuinely new agent items as new-since-last-review and appends them after existing positions", () => {
      const plan = planExtractionMerge([item({ id: "a", position: 4 })], {
        newItems: [{ section: "DELIVERABLES", text: "Brand new deliverable" }],
        changes: [],
      });
      expect(plan.creates).toEqual([
        { section: "DELIVERABLES", text: "Brand new deliverable", position: 5, isNewSinceLastReview: true },
      ]);
    });

    it("does not re-add an item matching an existing one's text, the agent's earlier wording, or a pending suggestion", () => {
      const existing = [
        item({ id: "a", text: "PM wording", agentOriginalText: "Agent wording", source: "PM_EDITED" }),
        item({ id: "b", section: "RISKS", text: "Risk B", pendingAgentSuggestion: "Risk B, reworded" }),
      ];
      const plan = planExtractionMerge(existing, {
        newItems: [
          { section: "DELIVERABLES", text: "agent wording" },
          { section: "DELIVERABLES", text: "PM  wording" },
          { section: "RISKS", text: "Risk B, reworded" },
        ],
        changes: [],
      });
      expect(plan.creates).toEqual([]);
    });

    it("updates an untouched AGENT item with the agent's revised wording (recorded as the agent's latest)", () => {
      const plan = planExtractionMerge([item({ id: "a" })], {
        newItems: [],
        changes: [{ itemId: "a", text: "Revised wording" }],
      });
      expect(plan.updates).toEqual([
        { itemId: "a", data: { text: "Revised wording", agentOriginalText: "Revised wording" } },
      ]);
    });

    it("keeps an excluded AGENT item excluded — the plan never touches `included`", () => {
      const plan = planExtractionMerge([item({ id: "a", included: false })], {
        newItems: [],
        changes: [{ itemId: "a", text: "Revised wording" }],
      });
      expect(plan.updates).toHaveLength(1);
      expect(Object.keys(plan.updates[0].data)).not.toContain("included");
    });

    it("never overwrites a PM_EDITED item's text: the change becomes a pending suggestion", () => {
      const plan = planExtractionMerge(
        [item({ id: "a", text: "PM wording", source: "PM_EDITED", agentOriginalText: "Original wording" })],
        { newItems: [], changes: [{ itemId: "a", text: "Agent new wording" }] }
      );
      expect(plan.updates).toEqual([{ itemId: "a", data: { pendingAgentSuggestion: "Agent new wording" } }]);
    });

    it("never overwrites a PM_ADDED item's text either", () => {
      const plan = planExtractionMerge(
        [item({ id: "a", text: "PM wrote this", source: "PM_ADDED", agentOriginalText: null })],
        { newItems: [], changes: [{ itemId: "a", text: "Agent take" }] }
      );
      expect(plan.updates).toEqual([{ itemId: "a", data: { pendingAgentSuggestion: "Agent take" } }]);
    });

    it("ignores a change repeating the agent's own earlier wording on an edited item, or one already pending", () => {
      const plan = planExtractionMerge(
        [
          item({ id: "a", text: "PM", source: "PM_EDITED", agentOriginalText: "Original wording" }),
          item({ id: "b", text: "PM", source: "PM_ADDED", agentOriginalText: null, pendingAgentSuggestion: "Same again" }),
        ],
        {
          newItems: [],
          changes: [
            { itemId: "a", text: "original wording" },
            { itemId: "b", text: "Same again" },
          ],
        }
      );
      expect(plan.updates).toEqual([]);
    });

    it("ignores a change identical to the current text", () => {
      const plan = planExtractionMerge([item({ id: "a" })], {
        newItems: [],
        changes: [{ itemId: "a", text: "Original wording" }],
      });
      expect(plan.updates).toEqual([]);
    });

    it("drops changes for ids that are not this project's items, and reports them", () => {
      const plan = planExtractionMerge([item({ id: "a" })], {
        newItems: [],
        changes: [{ itemId: "someone_elses_item", text: "Sneaky" }],
      });
      expect(plan.updates).toEqual([]);
      expect(plan.unknownItemIds).toEqual(["someone_elses_item"]);
    });

    it("never plans a deletion of any kind", () => {
      const plan = planExtractionMerge([item({ id: "a" }), item({ id: "b", position: 1 })], {
        newItems: [],
        changes: [],
      });
      expect(plan).toEqual({ creates: [], updates: [], unknownItemIds: [] });
    });
  });
});
