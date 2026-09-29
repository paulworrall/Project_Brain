// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  confirmBriefAttributeAction: vi.fn(),
  suggestBriefAttributesAction: vi.fn(),
}));

const { BriefChecklist } = await import("@/components/features/BriefChecklist");
const { briefCompleteness, briefRecord, ALL_REQUIRED_CONFIRMED } = await import(
  "../fixtures/briefCompleteness"
);
const { REQUIRED_BRIEF_ATTRIBUTES, OPTIONAL_BRIEF_ATTRIBUTES } = await import("@/lib/briefAttributes");

function renderChecklist(records = [] as Parameters<typeof briefCompleteness>[0]) {
  return render(<BriefChecklist projectId="proj_1" completeness={briefCompleteness(records)} />);
}

function row(attributeId: string): HTMLElement {
  return document.getElementById(`brief-attribute-${attributeId}`)!;
}

describe("BriefChecklist — What We Need to Find Out", () => {
  it("lists the required details first, in config order, and the optional ones in a separate group", () => {
    renderChecklist();

    const required = screen.getByRole("list", { name: "Required details" });
    const headings = within(required)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings).toEqual(REQUIRED_BRIEF_ATTRIBUTES.map((a) => a.label));
    expect(headings).toEqual(["Budget", "Objective", "Timeline and Key Milestones", "Client Contact"]);

    const optional = screen.getByRole("list", { name: "Optional details", hidden: true });
    expect(
      within(optional)
        .getAllByRole("heading", { hidden: true })
        .map((h) => h.textContent)
    ).toEqual(OPTIONAL_BRIEF_ATTRIBUTES.map((a) => a.label));
    expect(screen.getByText(/never block readiness/)).toBeInTheDocument();
  });

  it("shows each item's status, and exactly which sub-fields a partial item still needs", () => {
    renderChecklist([
      briefRecord("budget", { amount: "£50,000", currency: "GBP" }),
      briefRecord("clientContact", { name: "Caroline" }),
    ]);

    expect(row("budget")).toHaveTextContent("Confirmed");
    expect(row("clientContact")).toHaveTextContent("Partial");
    expect(row("clientContact")).toHaveTextContent("Still needed: Email");
    expect(row("objective")).toHaveTextContent("Missing");
    expect(row("objective")).toHaveTextContent("Fill in →");
    expect(screen.getByText("1 of 4 required details confirmed", { exact: false })).toBeInTheDocument();
  });

  it("shows an AI suggestion awaiting confirmation, with a way to confirm it", () => {
    renderChecklist([
      briefRecord("budget", { amount: "40,000", currency: "GBP" }, { kind: "SUGGESTION", source: "BRIEF" }),
    ]);

    expect(row("budget")).toHaveTextContent("Missing");
    expect(row("budget")).toHaveTextContent("Suggestion to review");
    expect(row("budget")).toHaveTextContent("AI suggestion from the brief — not confirmed");
    expect(within(row("budget")).getByText("Review and confirm →")).toBeInTheDocument();
    expect(screen.getByText("1 AI suggestion to review", { exact: false })).toBeInTheDocument();
  });

  it("optional details never count against readiness", () => {
    renderChecklist([...ALL_REQUIRED_CONFIRMED]);

    expect(screen.getByText("4 of 4 required details confirmed", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Optional details \(0 of 4 captured\)/)).toBeInTheDocument();
  });

  it("is derived from attribute status alone — a new confirmation shows on the next render, no regeneration", () => {
    const { rerender } = renderChecklist();
    expect(row("budget")).toHaveTextContent("Missing");

    rerender(
      <BriefChecklist
        projectId="proj_1"
        completeness={briefCompleteness([briefRecord("budget", { amount: "£50,000", currency: "GBP" })])}
      />
    );
    expect(row("budget")).toHaveTextContent("Confirmed");
  });

  describe("Timeline and Key Milestones", () => {
    it("shows start date, end date and each milestone as name + date", () => {
      renderChecklist([
        briefRecord("timeline", {
          startDate: "2026-10-01",
          endDate: "2026-12-15",
          milestones: [
            { name: "Beta", date: "2026-11-01" },
            { name: "Launch", date: null },
          ],
        }),
      ]);

      const timeline = row("timeline");
      expect(timeline).toHaveTextContent("Start date1 Oct 2026");
      expect(timeline).toHaveTextContent("End date15 Dec 2026");
      const items = within(timeline)
        .getAllByRole("listitem")
        .map((li) => li.textContent);
      expect(items).toEqual(["Beta — 1 Nov 2026", "Launch — Date not confirmed"]);
    });

    it("says clearly when no milestones or end date are confirmed yet", () => {
      renderChecklist([briefRecord("timeline", { startDate: "2026-10-01" })]);

      const timeline = row("timeline");
      expect(timeline).toHaveTextContent("Confirmed");
      expect(timeline).toHaveTextContent("No milestones confirmed yet");
      expect(timeline).toHaveTextContent("End dateNot confirmed yet");
    });
  });
});
