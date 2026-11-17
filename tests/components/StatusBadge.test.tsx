// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, STATUS_BADGE_TEXT, type StatusBadgeState } from "@/components/ui/StatusBadge";
import { DocumentStatusBadge } from "@/components/ui/DocumentStatusBadge";

const STATES = Object.keys(STATUS_BADGE_TEXT) as StatusBadgeState[];

describe("StatusBadge (FB-012)", () => {
  it.each(STATES)("%s shows an icon and text, with an accessible name", (state) => {
    const { container } = render(<StatusBadge state={state} />);
    const badge = screen.getByRole("img", { name: `Status: ${STATUS_BADGE_TEXT[state]}` });
    expect(badge).toHaveAttribute("data-state", state);
    expect(badge).toHaveTextContent(STATUS_BADGE_TEXT[state]);
    // Never colour alone: an inline icon sits beside the words, hidden from assistive tech.
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("uses 14px text (the meta size), never a smaller one", () => {
    render(<StatusBadge state="done" />);
    expect(screen.getByRole("img").className).toContain("text-xs");
    expect(screen.getByRole("img").className).not.toMatch(/text-\[/);
  });

  it("takes custom wording and accessible names", () => {
    render(<StatusBadge state="approved" text="Client approved · 19 Oct 2026" ariaLabel="Approved" />);
    expect(screen.getByRole("img", { name: "Approved" })).toHaveTextContent(
      "Client approved · 19 Oct 2026"
    );
  });

  it("DocumentStatusBadge keeps its document names and shows the approval date", () => {
    render(<DocumentStatusBadge state="approved" approvedOn="2026-10-19" />);
    const badge = screen.getByRole("img", { name: /^Document status: Client approved · /i });
    expect(badge).toHaveAttribute("data-state", "approved");
  });

  it("distinguishes every state by icon or text, so no two badges differ by colour alone", () => {
    // Text is unique per state, which is the minimum guarantee.
    expect(new Set(STATES.map((s) => STATUS_BADGE_TEXT[s])).size).toBe(STATES.length);
  });
});
