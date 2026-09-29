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

function renderView(overrides: Partial<Parameters<typeof PositionDocumentView>[0]> = {}) {
  return render(
    <PositionDocumentView
      fields={{ ...baseFields, ...overrides.fields }}
      showLegacyQuestions={overrides.showLegacyQuestions}
    />
  );
}

describe("PositionDocumentView", () => {
  it("never shows AI-generated open questions in the live view — the key-details checklist replaces them", () => {
    renderView({ fields: { ...baseFields, whatWeNeedToFindOut: ["Audience", "Approval chain"] } });

    expect(screen.queryByText("What We Need to Find Out")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier open questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Audience")).not.toBeInTheDocument();
  });

  describe("version history — earlier AI-generated open questions", () => {
    it("keeps an older version's questions readable, labelled as no longer updated", () => {
      renderView({
        fields: { ...baseFields, whatWeNeedToFindOut: ["Audience", "Timeline", "Approval chain"] },
        showLegacyQuestions: true,
      });

      expect(screen.getByText("Earlier open questions")).toBeInTheDocument();
      expect(screen.getByText(/no longer produced or updated/)).toBeInTheDocument();
      expect(screen.getByText("Audience")).toBeVisible();
      expect(screen.getByText("Approval chain")).toBeVisible();
      expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
    });

    it("shows nothing for versions saved without the old list", () => {
      renderView({ showLegacyQuestions: true });

      expect(screen.queryByText("Earlier open questions")).not.toBeInTheDocument();
    });

    it("truncates a long list to 5, with a 'Show N more' toggle that reveals the rest", async () => {
      const user = userEvent.setup();
      const gaps = ["Gap 1", "Gap 2", "Gap 3", "Gap 4", "Gap 5", "Gap 6", "Gap 7"];
      renderView({ fields: { ...baseFields, whatWeNeedToFindOut: gaps }, showLegacyQuestions: true });

      for (const gap of gaps.slice(0, 5)) {
        expect(screen.getByText(gap)).toBeVisible();
      }
      expect(screen.getByText("Gap 6")).not.toBeVisible();

      await user.click(screen.getByText("Show 2 more"));
      expect(screen.getByText("Gap 6")).toBeVisible();
      expect(screen.getByText("Gap 7")).toBeVisible();
    });
  });

  it("never truncates 'Client-Flagged Open Items', even when long", () => {
    const manyOpenItems = Array.from({ length: 10 }, (_, i) => `Open item ${i + 1}`);

    renderView({
      fields: { ...baseFields, clientFlaggedOpenItems: manyOpenItems },
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

    it("no longer derives readiness categories itself — key details live in the checklist", () => {
      renderView();
      expect(screen.queryByText("Foundation Details")).not.toBeInTheDocument();
      expect(screen.queryByText(/Brief Readiness/)).not.toBeInTheDocument();
    });
  });
});
