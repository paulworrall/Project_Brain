// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { normaliseBriefAssessment } from "@/types/intake";
import {
  BriefAssessmentCallout,
  BriefAssessmentLabel,
} from "@/components/features/BriefAssessmentNotice";

describe("normaliseBriefAssessment", () => {
  it.each(["complete", "partial", "thin"])("keeps %s", (level) => {
    expect(normaliseBriefAssessment({ level, reasons: [] })?.level).toBe(level);
  });

  it("treats an unknown level as partial, trims reasons and keeps at most 3", () => {
    expect(
      normaliseBriefAssessment({ level: " Maybe ", reasons: [" a ", "", "b", "c", "d"] })
    ).toEqual({ level: "partial", reasons: ["a", "b", "c"] });
    expect(normaliseBriefAssessment({ level: "THIN", reasons: [] })?.level).toBe("thin");
  });

  it("is null when the agent gave none (older projects)", () => {
    expect(normaliseBriefAssessment(null)).toBeNull();
    expect(normaliseBriefAssessment(undefined)).toBeNull();
  });
});

const props = { projectId: "p1", scopeConfirmed: false, readOnly: false };

describe("Brief step fast path", () => {
  it("complete: says so and makes Confirm scope the primary action", () => {
    render(<BriefAssessmentCallout {...props} assessment={{ level: "complete", reasons: [] }} />);
    expect(
      screen.getByText("This brief looks complete. You can confirm the scope now.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirm scope" })).toHaveAttribute(
      "href",
      "/projects/p1/brief#scope-gate"
    );
  });

  it("thin: a visible warning listing the reasons, with the clarification email as the primary action", () => {
    render(
      <BriefAssessmentCallout
        {...props}
        assessment={{ level: "thin", reasons: ["No deliverables", "No budget"] }}
      />
    );
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("This brief is thin.");
    expect(note).toHaveTextContent("No deliverables");
    expect(note).toHaveTextContent("No budget");
    expect(screen.getByRole("link", { name: "Open the clarification email" })).toHaveAttribute(
      "href",
      "/projects/p1/brief#clarification-email"
    );
  });

  it("partial, no assessment, a confirmed scope or a complete project: no callout", () => {
    const { container, rerender } = render(
      <BriefAssessmentCallout {...props} assessment={{ level: "partial", reasons: ["x"] }} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<BriefAssessmentCallout {...props} assessment={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <BriefAssessmentCallout
        {...props}
        scopeConfirmed
        assessment={{ level: "complete", reasons: [] }}
      />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <BriefAssessmentCallout {...props} readOnly assessment={{ level: "thin", reasons: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["complete", "Brief looks complete", "✓"],
    ["partial", "Brief is partly complete", "◐"],
    ["thin", "Brief is thin", "!"],
  ] as const)("the Scope summary card shows %s as icon + text", (level, text, icon) => {
    render(<BriefAssessmentLabel assessment={{ level, reasons: ["Timeline unclear"] }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText(icon)).toHaveAttribute("aria-hidden", "true");
  });
});
