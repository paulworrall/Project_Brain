// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { StaleOutputNotice } = await import("@/components/features/StaleOutputNotice");

const stale = {
  builtFromVersion: 2,
  latestVersion: 4,
  stale: true,
  reasons: ["New updates: v3, v4", "PM perspective edited"],
  canRegenerate: true,
};

describe("StaleOutputNotice", () => {
  it("shows nothing for an up-to-date output", () => {
    const { container } = render(
      <StaleOutputNotice freshness={{ ...stale, stale: false, reasons: [] }} regenerateAction={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says which version it was built from, what changed, and offers a one-click regenerate", async () => {
    const regenerate = vi.fn();
    const user = userEvent.setup();
    render(<StaleOutputNotice freshness={stale} regenerateAction={regenerate} />);

    expect(screen.getByRole("status")).toHaveTextContent("Built from v2 — v4 is available");
    expect(screen.getByRole("status")).toHaveTextContent("New updates: v3, v4 · PM perspective edited");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(regenerate).toHaveBeenCalled();
  });

  it("only flags an output that isn't regenerated automatically, with no button", () => {
    render(
      <StaleOutputNotice
        freshness={{ ...stale, canRegenerate: false }}
        flagOnlyHint="Estimates come from your team's input — review it and save a new version if needed."
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Built from v2 — v4 is available");
    expect(screen.getByRole("status")).toHaveTextContent("Estimates come from your team's input");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
