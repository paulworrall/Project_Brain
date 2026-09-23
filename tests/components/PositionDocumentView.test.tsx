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

  describe("other details from the brief", () => {
    it("keeps every captured detail as general brief context, collapsed by default", async () => {
      const user = userEvent.setup();
      renderView({
        fields: {
          ...baseFields,
          whatWeKnow: [
            { topic: "Objective", detail: "Refresh the campaign." },
            { topic: "Audience", detail: "18-34 year olds" },
          ],
        },
      });

      expect(screen.getByText("Other details from the brief")).toBeInTheDocument();
      expect(screen.getByText("2 details captured")).toBeInTheDocument();
      expect(screen.getByText("18-34 year olds")).not.toBeVisible();

      await user.click(screen.getByText("2 details captured"));
      expect(screen.getByText("18-34 year olds")).toBeVisible();
      expect(screen.getByText("Refresh the campaign.")).toBeVisible();
    });

    it("says so when nothing has been captured yet", () => {
      renderView({ fields: { ...baseFields, whatWeKnow: [] } });
      expect(screen.getByText("Nothing captured yet.")).toBeInTheDocument();
    });

    it("no longer derives readiness categories itself — key details live in KeyAttributesPanel", () => {
      renderView();
      expect(screen.queryByText("Foundation Details")).not.toBeInTheDocument();
      expect(screen.queryByText(/Brief Readiness/)).not.toBeInTheDocument();
    });
  });
});
