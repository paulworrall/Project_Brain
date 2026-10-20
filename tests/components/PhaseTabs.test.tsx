// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhaseTabs } from "@/components/features/PhaseTabs";
import { deriveProjectPhaseStatuses } from "@/lib/projectPhases";

const statuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: false });

describe("PhaseTabs", () => {
  it("is a labelled nav of five links in order, with status text", () => {
    render(<PhaseTabs projectId="p1" phaseStatuses={statuses} activePhaseId="discover" />);
    const nav = screen.getByRole("navigation", { name: "Project phases" });
    expect(screen.queryByRole("tablist")).toBeNull();
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/projects/p1/discover",
      "/projects/p1/define",
      "/projects/p1/develop",
      "/projects/p1/deliver",
      "/projects/p1/dialogue",
    ]);
    expect(within(nav).getAllByText("Not started")).toHaveLength(4);
    expect(within(nav).getByText("In progress")).toBeInTheDocument();
  });

  it("marks only the active link aria-current, and names include status", () => {
    render(<PhaseTabs projectId="p1" phaseStatuses={statuses} activePhaseId="define" />);
    expect(screen.getByRole("link", { name: "Define, not started" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Discover, in progress" })).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("is keyboard operable: Tab walks the links in order", async () => {
    const user = userEvent.setup();
    render(<PhaseTabs projectId="p1" phaseStatuses={statuses} activePhaseId="discover" />);
    await user.tab();
    expect(screen.getByRole("link", { name: "Discover, in progress" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Define, not started" })).toHaveFocus();
  });

  describe("styling states", () => {
    const render5 = (active: "discover" | "define") =>
      render(<PhaseTabs projectId="p1" phaseStatuses={statuses} activePhaseId={active} />);

    it("gives the active tab the selected fill, indicator, weight and thicker accent bar", () => {
      render5("define");
      const active = screen.getByRole("link", { name: "Define, not started" });
      expect(active).toHaveClass("bg-accent", "border-primary!");
      expect(within(active).getByText("Define")).toHaveClass("font-semibold", "text-primary");
      expect(active.querySelector("span[aria-hidden]")).toHaveClass("h-1");
      // Secondary text is darkened for AA on the tint.
      expect(within(active).getByText(/Ideate/)).toHaveClass("text-muted-foreground-strong");
    });

    it("keeps inactive tabs free of the selected styling, with hover, press and focus variants", () => {
      render5("define");
      const inactive = screen.getByRole("link", { name: "Discover, in progress" });
      expect(inactive).not.toHaveClass("bg-accent");
      expect(inactive).not.toHaveClass("border-primary!");
      expect(within(inactive).getByText("Discover")).not.toHaveClass("text-primary");
      expect(inactive.className).toContain("hover:bg-surface-muted");
      expect(inactive.className).toContain("active:bg-border");
      expect(inactive.className).toContain("focus-visible:outline-2");
      expect(inactive).toHaveClass("cursor-pointer", "min-h-11");
      // hover must not borrow the selected look
      expect(inactive.className).not.toMatch(/hover:(bg-accent|border-primary|text-primary)/);
    });

    it("makes every tab one link, with the connectors outside the links", () => {
      render5("discover");
      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(5);
      for (const link of links) {
        expect(link.querySelectorAll("a")).toHaveLength(0);
        expect(link).toHaveTextContent(/Initiate|Ideate|Build|Train|Analyze/);
      }
      const connectors = document.querySelectorAll("ol > li > span[aria-hidden]");
      expect(connectors).toHaveLength(4);
      for (const connector of connectors) expect(connector.closest("a")).toBeNull();
    });

    it("only transitions when motion is allowed", () => {
      render5("define");
      for (const link of screen.getAllByRole("link")) {
        expect(link.className).toContain("motion-safe:transition-colors");
        expect(link.className).not.toMatch(/(^|\s)transition(-colors)?(\s|$)/);
      }
    });
  });
});
