import { describe, expect, it } from "vitest";
import {
  PM_PERSPECTIVE_FIELDS,
  PM_PERSPECTIVE_PROMPT_TAG,
  formatPmPerspectiveForPrompt,
  hasPmPerspective,
  pmPerspectiveValuesFromFormData,
} from "@/lib/pmPerspective";

describe("PM perspective config", () => {
  it("defines the five PM perspective fields, each with a label and helper text", () => {
    expect(PM_PERSPECTIVE_FIELDS.map((f) => f.id)).toEqual([
      "context",
      "initialThoughts",
      "proposedSolution",
      "consultancyGuidance",
      "earlyKpis",
    ]);
    expect(PM_PERSPECTIVE_FIELDS.map((f) => f.label)).toEqual([
      "Context",
      "Initial thoughts",
      "Proposed solution",
      "Consultancy guidance",
      "Early KPIs",
    ]);
    for (const field of PM_PERSPECTIVE_FIELDS) {
      expect(field.helper.length).toBeGreaterThan(10);
    }
  });
});

describe("formatPmPerspectiveForPrompt", () => {
  it("wraps the PM's view in its own labelled block, with an instruction never to present it as the client's words", () => {
    const block = formatPmPerspectiveForPrompt({
      context: "Client had a bad experience with their last agency.",
      earlyKpis: "20% more monthly actives",
    });

    expect(block.startsWith(`<${PM_PERSPECTIVE_PROMPT_TAG}>`)).toBe(true);
    expect(block.trimEnd().endsWith(`</${PM_PERSPECTIVE_PROMPT_TAG}>`)).toBe(true);
    expect(block).toMatch(/Project Manager's own view/);
    expect(block).toMatch(/never present anything in it as something the client said/i);
    expect(block).toContain("Context:\nClient had a bad experience with their last agency.");
    expect(block).toContain("Early KPIs:\n20% more monthly actives");
  });

  it("leaves out empty fields", () => {
    const block = formatPmPerspectiveForPrompt({
      context: "Known client.",
      initialThoughts: "   ",
    });
    expect(block).toContain("Context:");
    expect(block).not.toContain("Initial thoughts:");
  });

  it("returns an empty string when the PM hasn't added anything, so prompts carry no empty block", () => {
    expect(formatPmPerspectiveForPrompt({})).toBe("");
    expect(formatPmPerspectiveForPrompt({ context: "", earlyKpis: "  " })).toBe("");
    expect(hasPmPerspective({ context: " " })).toBe(false);
    expect(hasPmPerspective({ proposedSolution: "A phased rollout." })).toBe(true);
  });
});

describe("pmPerspectiveValuesFromFormData", () => {
  it("reads each field from its own prefixed form input, trimming and ignoring unknown inputs", () => {
    const formData = new FormData();
    formData.set("pm_context", "  Known client.  ");
    formData.set("pm_earlyKpis", "");
    formData.set("briefText", "The client brief.");
    formData.set("pm_somethingElse", "ignored");

    expect(pmPerspectiveValuesFromFormData(formData)).toEqual({
      context: "Known client.",
      initialThoughts: "",
      proposedSolution: "",
      consultancyGuidance: "",
      earlyKpis: "",
    });
  });
});
