// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PositionDocumentView } from "@/components/features/PositionDocumentView";

const baseFields = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  clientFlaggedOpenItems: ["Budget"],
};

describe("PositionDocumentView", () => {
  it("shows every item of a short 'What We Need to Find Out' list with no truncation", () => {
    render(
      <PositionDocumentView
        fields={{ ...baseFields, whatWeNeedToFindOut: ["Audience", "Timeline", "Approval chain"] }}
      />
    );

    expect(screen.getByText("Audience")).toBeVisible();
    expect(screen.getByText("Timeline")).toBeVisible();
    expect(screen.getByText("Approval chain")).toBeVisible();
    expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
  });

  it("truncates a long 'What We Need to Find Out' list to 5, with a 'Show N more' toggle for the rest", () => {
    const gaps = ["Gap 1", "Gap 2", "Gap 3", "Gap 4", "Gap 5", "Gap 6", "Gap 7"];
    render(<PositionDocumentView fields={{ ...baseFields, whatWeNeedToFindOut: gaps }} />);

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
    render(<PositionDocumentView fields={{ ...baseFields, whatWeNeedToFindOut: gaps }} />);

    await user.click(screen.getByText("Show 2 more"));

    expect(screen.getByText("Gap 6")).toBeVisible();
    expect(screen.getByText("Gap 7")).toBeVisible();
  });

  it("never truncates 'What We Know' or 'Client-Flagged Open Items', even when long", () => {
    const manyKnownItems = Array.from({ length: 10 }, (_, i) => ({
      topic: `Topic ${i + 1}`,
      detail: `Detail ${i + 1}`,
    }));
    const manyOpenItems = Array.from({ length: 10 }, (_, i) => `Open item ${i + 1}`);

    render(
      <PositionDocumentView
        fields={{
          ...baseFields,
          whatWeKnow: manyKnownItems,
          whatWeNeedToFindOut: [],
          clientFlaggedOpenItems: manyOpenItems,
        }}
      />
    );

    expect(screen.getByText("Detail 10")).toBeVisible();
    expect(screen.getByText("Open item 10")).toBeVisible();
    expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
  });
});
