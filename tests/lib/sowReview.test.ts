import { describe, expect, it } from "vitest";
import {
  SOW_REVIEW_SECTIONS,
  checkStepAdvance,
  clampStep,
  includeLabel,
  sectionCounts,
  snapshotItems,
  stepIndicator,
  type SowItemDto,
} from "@/lib/sowReview";

function item(overrides: Partial<SowItemDto> & Pick<SowItemDto, "id">): SowItemDto {
  return {
    section: "DELIVERABLES",
    text: "Some text",
    agentOriginalText: "Some text",
    source: "AGENT",
    included: true,
    position: 0,
    isNewSinceLastReview: false,
    pendingAgentSuggestion: null,
    version: 0,
    ...overrides,
  };
}

describe("sow review rules", () => {
  it("models the five sections in order, as data a template could later drive", () => {
    expect(SOW_REVIEW_SECTIONS.map((s) => s.key)).toEqual([
      "DELIVERABLES",
      "SERVICES",
      "ASSUMPTIONS",
      "OUT_OF_SCOPE",
      "RISKS",
    ]);
  });

  it("describes the step as 'Step N of 6: <Section>'", () => {
    expect(stepIndicator(0)).toBe("Step 1 of 6: Deliverables");
    expect(stepIndicator(1)).toBe("Step 2 of 6: Services");
    expect(stepIndicator(5)).toBe("Step 6 of 6: Review & generate");
  });

  it("clamps a saved step into range", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(5);
    expect(clampStep(Number.NaN)).toBe(0);
  });

  describe("checkStepAdvance", () => {
    it("blocks Deliverables with no included item — an excluded or blank one does not count", () => {
      expect(checkStepAdvance("DELIVERABLES", []).kind).toBe("blocked");
      expect(checkStepAdvance("DELIVERABLES", [item({ id: "a", included: false })]).kind).toBe("blocked");
      expect(checkStepAdvance("DELIVERABLES", [item({ id: "a", text: "  " })]).kind).toBe("blocked");
      expect(checkStepAdvance("DELIVERABLES", [item({ id: "a" })]).kind).toBe("ok");
    });

    it("asks for a lightweight confirm on an empty optional section, naming it", () => {
      expect(checkStepAdvance("RISKS", [])).toEqual({ kind: "confirm", message: "No risks listed — continue?" });
      expect(checkStepAdvance("OUT_OF_SCOPE", [])).toEqual({
        kind: "confirm",
        message: "No out-of-scope items listed — continue?",
      });
      expect(checkStepAdvance("RISKS", [item({ id: "r", section: "RISKS" })]).kind).toBe("ok");
    });
  });

  it("labels each checkbox with its item: 'Include deliverable 3: <first words>'", () => {
    expect(includeLabel("DELIVERABLES", 2, "A fully responsive loyalty app with rewards and referral features")).toBe(
      "Include deliverable 3: A fully responsive loyalty app with…"
    );
    expect(includeLabel("RISKS", 0, "Tight timeline")).toBe("Include risk 1: Tight timeline");
  });

  it("counts included / excluded / added / edited per section, ignoring blank items", () => {
    const items = [
      item({ id: "1" }),
      item({ id: "2", included: false }),
      item({ id: "3", source: "PM_ADDED", agentOriginalText: null }),
      item({ id: "4", source: "PM_EDITED" }),
      item({ id: "5", source: "PM_ADDED", text: "" }),
      item({ id: "6", section: "RISKS" }),
    ];
    expect(sectionCounts(items, "DELIVERABLES")).toEqual({ included: 3, excluded: 1, added: 1, edited: 1 });
    expect(sectionCounts(items, "RISKS")).toEqual({ included: 1, excluded: 0, added: 0, edited: 0 });
  });

  it("snapshots only included, non-blank items — section, text, position and source — in section then position order", () => {
    const items = [
      item({ id: "r", section: "RISKS", text: "A risk", position: 0 }),
      item({ id: "d2", text: "Second", position: 1, source: "PM_EDITED" }),
      item({ id: "d1", text: "First", position: 0 }),
      item({ id: "x", text: "Excluded", included: false, position: 2 }),
      item({ id: "b", text: "", source: "PM_ADDED", position: 3 }),
    ];
    expect(snapshotItems(items)).toEqual([
      { section: "DELIVERABLES", text: "First", position: 0, source: "AGENT" },
      { section: "DELIVERABLES", text: "Second", position: 1, source: "PM_EDITED" },
      { section: "RISKS", text: "A risk", position: 0, source: "AGENT" },
    ]);
  });
});
