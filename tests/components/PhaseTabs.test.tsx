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
});
