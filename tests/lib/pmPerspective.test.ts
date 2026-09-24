import { describe, expect, it } from "vitest";
import {
  PM_PERSPECTIVE_FIELDS,
  PM_PERSPECTIVE_PROMPT_TAG,
  formatPmPerspectiveForPrompt,
  hasPmPerspective,
  pmPerspectiveValuesFromFormData,
} from "@/lib/pmPerspective";

describe("PM perspective config", () => {
  it("defines just two fields — Initial thoughts and Proposed solution — each with helper text", () => {
    expect(PM_PERSPECTIVE_FIELDS.map((f) => f.id)).toEqual(["initialThoughts", "proposedSolution"]);
    expect(PM_PERSPECTIVE_FIELDS.map((f) => f.label)).toEqual(["Initial thoughts", "Proposed solution"]);
    for (const field of PM_PERSPECTIVE_FIELDS) {
      expect(field.helper.length).toBeGreaterThan(10);
    }
  });
});

describe("formatPmPerspectiveForPrompt", () => {
  it("wraps the PM's view in its own labelled block, with an instruction never to present it as the client's words", () => {
    const block = formatPmPerspectiveForPrompt({
      initialThoughts: "Ambitious for a pilot.",
      proposedSolution: "Start with one partner in one market.",
    });

    expect(block.startsWith(`<${PM_PERSPECTIVE_PROMPT_TAG}>`)).toBe(true);
    expect(block.trimEnd().endsWith(`</${PM_PERSPECTIVE_PROMPT_TAG}>`)).toBe(true);
    expect(block).toMatch(/Project Manager's own view/);
    expect(block).toMatch(/never present anything in it as something the client said/i);
    expect(block).toContain("Initial thoughts:\nAmbitious for a pilot.");
    expect(block).toContain("Proposed solution:\nStart with one partner in one market.");
  });

  it("leaves out empty fields, and anything that isn't a configured field", () => {
    const block = formatPmPerspectiveForPrompt({
      initialThoughts: "Ambitious.",
      proposedSolution: "   ",
      context: "A field that no longer exists.",
    });
    expect(block).toContain("Initial thoughts:");
    expect(block).not.toContain("Proposed solution:");
    expect(block).not.toContain("A field that no longer exists.");
  });

  it("returns an empty string when the PM hasn't added anything, so prompts carry no empty block", () => {
    expect(formatPmPerspectiveForPrompt({})).toBe("");
    expect(formatPmPerspectiveForPrompt({ initialThoughts: "", proposedSolution: "  " })).toBe("");
    expect(hasPmPerspective({ initialThoughts: " " })).toBe(false);
    expect(hasPmPerspective({ proposedSolution: "A phased rollout." })).toBe(true);
  });
});

describe("pmPerspectiveValuesFromFormData", () => {
  it("reads each field from its own prefixed form input, trimming and ignoring unknown inputs", () => {
    const formData = new FormData();
    formData.set("pm_initialThoughts", "  Ambitious.  ");
    formData.set("pm_proposedSolution", "");
    formData.set("briefText", "The client brief.");
    formData.set("pm_context", "ignored — no longer a field");

    expect(pmPerspectiveValuesFromFormData(formData)).toEqual({
      initialThoughts: "Ambitious.",
      proposedSolution: "",
    });
  });
});
