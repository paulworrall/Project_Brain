// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LibrarySummaryList } from "@/components/features/LibrarySummaryList";

describe("LibrarySummaryList", () => {
  it("shows the empty message and no list when there are no items", () => {
    render(
      <LibrarySummaryList
        title="Rate Cards"
        manageHref="/rate-cards"
        items={[]}
        emptyMessage="No rate cards on file yet."
      />
    );

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders each item's name, optional tag, and filename, but never both the list and the empty message", () => {
    render(
      <LibrarySummaryList
        title="Rate Cards"
        manageHref="/rate-cards"
        items={[
          { id: "1", name: "2026 Standard Rates", tag: "current", fileName: "rates.pdf" },
          { id: "2", name: "Retainer Rates", fileName: null },
        ]}
        emptyMessage="No rate cards on file yet."
      />
    );

    expect(screen.getByText("2026 Standard Rates")).toBeInTheDocument();
    expect(screen.getByText("(current)")).toBeInTheDocument();
    expect(screen.getByText("rates.pdf")).toBeInTheDocument();
    expect(screen.getByText("Retainer Rates")).toBeInTheDocument();
    expect(screen.getByText("Not yet uploaded")).toBeInTheDocument();
    expect(screen.queryByText("No rate cards on file yet.")).not.toBeInTheDocument();
  });

  it("links 'Manage in library' to the given href, focusably", () => {
    render(
      <LibrarySummaryList
        title="Rate Cards"
        manageHref="/rate-cards"
        items={[]}
        emptyMessage="No rate cards on file yet."
      />
    );

    const link = screen.getByRole("link", { name: /Manage in library/ });
    expect(link).toHaveAttribute("href", "/rate-cards");
    link.focus();
    expect(link).toHaveFocus();
  });

  it("renders extra children (e.g. a quick-add form) below the list", () => {
    render(
      <LibrarySummaryList
        title="Rate Cards"
        manageHref="/rate-cards"
        items={[]}
        emptyMessage="No rate cards on file yet."
      >
        <button type="button">Add rate card</button>
      </LibrarySummaryList>
    );

    expect(screen.getByRole("button", { name: "Add rate card" })).toBeInTheDocument();
  });
});
