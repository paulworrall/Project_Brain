import { describe, expect, it } from "vitest";
import {
  EMPTY_SCOPE_SUMMARY,
  SCOPE_SECTIONS,
  changedScopeSections,
  normaliseScopeSummary,
  type ScopeSummaryContent,
} from "@/types/scope";
import { buildScopeView, openQuestionCount } from "@/lib/scopeSummaryView";
import { emailFieldsFromScopeSummary } from "@/services/agents/intake-agent";
import { briefCompleteness, briefRecord } from "../fixtures/briefCompleteness";

const content: ScopeSummaryContent = {
  context: "Fizzy wants a summer launch campaign.",
  outOfScope: ["Paid media buying"],
  deliverables: ["Campaign concept", "Social toolkit"],
  constraints: ["Legal sign-off on claims"],
  assumptions: ["Client supplies product imagery"],
  openQuestions: ["Which markets launch first?"],
};

describe("Scope summary sections", () => {
  it("are the brief's eight sections, in order", () => {
    expect(SCOPE_SECTIONS.map((s) => s.label)).toEqual([
      "Context",
      "Objectives",
      "In scope",
      "Out of scope",
      "Deliverables",
      "Timeline and constraints",
      "Assumptions",
      "Open questions",
    ]);
  });

  it("names exactly the stored sections that changed", () => {
    expect(changedScopeSections(content, content)).toEqual([]);
    expect(
      changedScopeSections(content, {
        ...content,
        deliverables: ["Campaign concept"],
        openQuestions: [],
      })
    ).toEqual(["Deliverables", "Open questions"]);
    expect(changedScopeSections(null, { ...EMPTY_SCOPE_SUMMARY, context: "New" })).toEqual([
      "Context",
    ]);
  });

  it("normalises whitespace and drops empty items", () => {
    expect(
      normaliseScopeSummary({ ...content, context: "  x  ", deliverables: [" a ", "", "  "] })
    ).toMatchObject({ context: "x", deliverables: ["a"] });
  });
});

describe("buildScopeView", () => {
  const keyDetails = briefCompleteness([
    briefRecord("objective", { objective: "Grow summer sales" }),
    briefRecord("budget", { amount: "£50,000", currency: "GBP" }),
  ]);

  it("shows key details read-only in their sections, never stored twice", () => {
    const view = buildScopeView(content, keyDetails);
    const objectives = view.find((s) => s.id === "objectives")!;
    expect(objectives.editable).toBe(false);
    expect(objectives.items).toEqual([
      { text: expect.stringMatching(/Grow summer sales/), source: "key_detail" },
    ]);
    const timeline = view.find((s) => s.id === "timelineAndConstraints")!;
    expect(timeline.items.map((i) => i.source)).toEqual(["key_detail", "summary"]);
  });

  it("lists outstanding required key details under Open questions, then the stored ones", () => {
    const view = buildScopeView(content, keyDetails);
    const open = view.find((s) => s.id === "openQuestions")!;
    expect(open.items.at(-1)).toEqual({ text: "Which markets launch first?", source: "summary" });
    expect(open.items.filter((i) => i.source === "key_detail").length).toBe(
      keyDetails.requiredOutstanding.length
    );
    expect(openQuestionCount(content, keyDetails)).toBe(keyDetails.requiredOutstanding.length + 1);
  });

  it("works without a Scope summary (key details only)", () => {
    const view = buildScopeView(null, keyDetails);
    expect(view.find((s) => s.id === "deliverables")!.items).toEqual([]);
    expect(openQuestionCount(null, keyDetails)).toBe(keyDetails.requiredOutstanding.length);
  });
});

describe("emailFieldsFromScopeSummary", () => {
  it("gives the email the open questions as the client's still-deciding items", () => {
    const fields = emailFieldsFromScopeSummary(content);
    expect(fields.clientFlaggedOpenItems).toEqual(["Which markets launch first?"]);
    expect(fields.whatWeKnow[0]).toEqual({ topic: "Context", detail: content.context });
  });
});
