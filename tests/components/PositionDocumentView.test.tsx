// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PositionDocumentView } from "@/components/features/PositionDocumentView";

const baseFields = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: [] as string[],
  clientFlaggedOpenItems: ["Budget"],
};

function renderView(overrides: Partial<Parameters<typeof PositionDocumentView>[0]> = {}) {
  return render(
    <PositionDocumentView
      fields={{ ...baseFields, ...overrides.fields }}
      kickOffDate={overrides.kickOffDate ?? null}
      targetCompletionDate={overrides.targetCompletionDate ?? null}
    />
  );
}

describe("PositionDocumentView", () => {
  it("shows every item of a short 'What We Need to Find Out' list with no truncation", () => {
    renderView({
      fields: { ...baseFields, whatWeNeedToFindOut: ["Audience", "Timeline", "Approval chain"] },
    });

    expect(screen.getByText("Audience")).toBeVisible();
    expect(screen.getByText("Approval chain")).toBeVisible();
    expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
  });

  it("truncates a long 'What We Need to Find Out' list to 5, with a 'Show N more' toggle for the rest", () => {
    const gaps = ["Gap 1", "Gap 2", "Gap 3", "Gap 4", "Gap 5", "Gap 6", "Gap 7"];
    renderView({ fields: { ...baseFields, whatWeNeedToFindOut: gaps } });

    for (const gap of gaps.slice(0, 5)) {
      expect(screen.getByText(gap)).toBeVisible();
    }
    for (const gap of gaps.slice(5)) {
      expect(screen.getByText(gap)).not.toBeVisible();
    }
    expect(screen.getByText("Show 2 more")).toBeInTheDocument();
  });

  it("reveals the truncated items once 'Show N more' is expanded", async () => {
    const user = userEvent.setup();
    const gaps = ["Gap 1", "Gap 2", "Gap 3", "Gap 4", "Gap 5", "Gap 6", "Gap 7"];
    renderView({ fields: { ...baseFields, whatWeNeedToFindOut: gaps } });

    await user.click(screen.getByText("Show 2 more"));

    expect(screen.getByText("Gap 6")).toBeVisible();
    expect(screen.getByText("Gap 7")).toBeVisible();
  });

  it("never truncates 'Client-Flagged Open Items', even when long", () => {
    const manyOpenItems = Array.from({ length: 10 }, (_, i) => `Open item ${i + 1}`);

    renderView({
      fields: { ...baseFields, whatWeNeedToFindOut: [], clientFlaggedOpenItems: manyOpenItems },
    });

    expect(screen.getByText("Open item 10")).toBeVisible();
    expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
  });

  describe("Foundation Details", () => {
    it("always shows all five categories, even with a nearly empty position document", () => {
      renderView({
        fields: {
          ...baseFields,
          primaryContactName: null,
          primaryContactEmail: null,
          whatWeKnow: [],
          clientFlaggedOpenItems: [],
          whatWeNeedToFindOut: [],
        },
      });

      expect(screen.getByText("Foundation Details")).toBeInTheDocument();
      expect(screen.getByText("Client Name")).toBeInTheDocument();
      expect(screen.getByText("Problem / Objective")).toBeInTheDocument();
      expect(screen.getByText("Timeline")).toBeInTheDocument();
      expect(screen.getByText("Budget & commercial shape")).toBeInTheDocument();
      expect(screen.getByText("Scope")).toBeInTheDocument();
    });

    it("shows Client Name as the client-side contact managing the project, not a separate 'Primary Contact' card", () => {
      renderView();

      // Exactly one place shows this — no duplicate "Primary Contact" card.
      expect(screen.getByText("Jamie Chen — jamie@example.com")).toBeInTheDocument();
      expect(screen.queryByText("Primary Contact")).not.toBeInTheDocument();
    });

    it("shows Client Name as Missing when no contact is named in the brief", () => {
      renderView({
        fields: {
          ...baseFields,
          primaryContactName: null,
          primaryContactEmail: null,
          clientFlaggedOpenItems: [],
        },
      });

      const clientNameRow = screen.getByText("Client Name").closest("div")!;
      expect(clientNameRow).toHaveTextContent("Missing");
    });

    it("shows a category as Confirmed when a whatWeKnow topic matches its keywords", () => {
      renderView({ fields: { ...baseFields, whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }] } });

      expect(screen.getByText("Refresh the campaign.")).toBeInTheDocument();
    });

    it("shows a category as Partial when only flagged as an open item, not confirmed in the brief", () => {
      renderView({
        fields: { ...baseFields, whatWeKnow: [], clientFlaggedOpenItems: ["Budget"], whatWeNeedToFindOut: [] },
      });

      expect(screen.getByText("Flagged as open: Budget")).toBeInTheDocument();
    });

    it("shows a category as Missing with a prompt-style placeholder when nothing matches", () => {
      renderView({
        fields: {
          ...baseFields,
          primaryContactName: null,
          primaryContactEmail: null,
          whatWeKnow: [],
          clientFlaggedOpenItems: [],
          whatWeNeedToFindOut: [],
        },
      });

      expect(screen.getAllByText("Not yet provided — ask in first client discussion").length).toBeGreaterThan(0);
    });

    it("shows Timeline as Partial when only a start date is known, with no deadline", () => {
      renderView({
        fields: { ...baseFields, whatWeKnow: [], clientFlaggedOpenItems: [], whatWeNeedToFindOut: [] },
        kickOffDate: new Date("2026-09-01T00:00:00Z"),
        targetCompletionDate: null,
      });

      expect(screen.getByText(/target completion not yet set/)).toBeInTheDocument();
    });

    it("shows Timeline as Confirmed when both a start and target completion date are known", () => {
      renderView({
        fields: { ...baseFields, whatWeKnow: [], clientFlaggedOpenItems: [], whatWeNeedToFindOut: [] },
        kickOffDate: new Date("2026-09-01T00:00:00Z"),
        targetCompletionDate: new Date("2026-12-01T00:00:00Z"),
      });

      expect(screen.getByText(/Start: 1 Sept 2026/)).toBeInTheDocument();
    });

    it("does not render the Brief Readiness strip here — it lives in the step card's header row instead", () => {
      renderView();

      expect(screen.queryByText(/Brief Readiness/)).not.toBeInTheDocument();
    });
  });

  describe("secondary details expander", () => {
    it("moves whatWeKnow items that don't map to a Foundation category into a collapsed expander", () => {
      renderView({
        fields: {
          ...baseFields,
          whatWeKnow: [
            { topic: "Objective", detail: "Refresh the campaign." },
            { topic: "Attendees", detail: "Jamie, Sam, Priya" },
            { topic: "Meeting Type", detail: "Kickoff call" },
          ],
        },
      });

      expect(screen.getByText("2 additional details captured")).toBeInTheDocument();
      expect(screen.queryByText("Jamie, Sam, Priya")).not.toBeVisible();
    });

    it("expands the secondary details on click and shows them", async () => {
      const user = userEvent.setup();
      renderView({
        fields: {
          ...baseFields,
          whatWeKnow: [
            { topic: "Objective", detail: "Refresh the campaign." },
            { topic: "Attendees", detail: "Jamie, Sam, Priya" },
          ],
        },
      });

      await user.click(screen.getByText("1 additional detail captured"));

      expect(screen.getByText("Jamie, Sam, Priya")).toBeVisible();
    });

    it("shows a plain message when there are no secondary details at all", () => {
      renderView({ fields: { ...baseFields, whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }] } });

      expect(screen.getByText("No additional details captured.")).toBeInTheDocument();
      expect(screen.queryByText(/additional detail.*captured$/)).not.toBeInTheDocument();
    });
  });
});
