// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SowChange } from "@/lib/sowChangeView";

const { SowChangeNotice } = await import("@/components/features/SowChangeNotice");
const { SowDownloadLink } = await import("@/components/features/SowDownloadLink");

const change = (n: number, extra: Partial<SowChange> = {}): SowChange => ({
  versionLabel: `v${n}`,
  date: new Date("2026-10-13T10:00:00Z"),
  source: "Client",
  fields: ["Budget"],
  summary: `Change number ${n}`,
  ...extra,
});

describe("SowChangeNotice", () => {
  it("renders nothing when there are no material changes", () => {
    const { container } = render(<SowChangeNotice changes={[]} onReview={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the headline and one line per change in a status region, with the meaning in text", () => {
    render(
      <SowChangeNotice
        changes={[
          change(3, { summary: "Budget restated as €120k excluding media; launch set for second week of January" }),
          change(2, { versionLabel: "PM edit", source: "PM", summary: "Timeline edited by the PM" }),
        ]}
        onReview={vi.fn()}
      />
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Updates since this SOW was generated");
    const items = within(notice).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      "v3 · 13 Oct 2026 · Client — Budget restated as €120k excluding media; launch set for second week of January"
    );
    expect(items[1]).toHaveTextContent("PM edit · 13 Oct 2026 · PM — Timeline edited by the PM");
    // Caution styling is an amber left border; the headline text carries the meaning.
    expect(notice.className).toMatch(/border-l-4/);
    expect(notice.className).toMatch(/border-warning/);
    expect(notice.className).not.toMatch(/danger/);
  });

  it("omits the date for a change that can't be dated", () => {
    render(<SowChangeNotice changes={[change(1, { versionLabel: "Capabilities", date: null, source: "PM" })]} onReview={vi.fn()} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Capabilities · PM — Change number 1");
  });

  it("shows at most 3 lines, then 'Show all (n)' reveals the rest", async () => {
    const user = userEvent.setup();
    render(<SowChangeNotice changes={[1, 2, 3, 4, 5].map((n) => change(n))} onReview={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const toggle = screen.getByRole("button", { name: "Show all (5)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("offers no 'Show all' with 3 or fewer changes", () => {
    render(<SowChangeNotice changes={[1, 2, 3].map((n) => change(n))} onReview={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();
  });

  it("has a plain 'Review and update the SOW' link that only opens the review step, and no dismiss or regenerate control", async () => {
    const onReview = vi.fn();
    const user = userEvent.setup();
    render(<SowChangeNotice changes={[change(3)]} onReview={onReview} />);

    expect(screen.queryByRole("button", { name: /dismiss|close|regenerate|update sow/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review and update the SOW" }));

    expect(onReview).toHaveBeenCalledTimes(1);
  });
});

describe("SowDownloadLink", () => {
  it("downloads directly when the SOW has no unincluded updates", () => {
    render(
      <SowDownloadLink href="/api/sow/1" staleWarning={null}>
        Download .docx →
      </SowDownloadLink>
    );
    expect(screen.getByRole("link", { name: "Download .docx →" })).toHaveAttribute("href", "/api/sow/1");
  });

  it("asks before downloading a SOW that doesn't include the latest updates, trapping focus and restoring it on close", async () => {
    const user = userEvent.setup();
    render(
      <SowDownloadLink href="/api/sow/1" staleWarning="This SOW doesn't include the latest updates.">
        Download .docx →
      </SowDownloadLink>
    );

    const trigger = screen.getByRole("button", { name: "Download .docx →" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /latest updates/i });
    expect(dialog).toHaveTextContent("This SOW doesn't include the latest updates. Review it first, or download anyway?");
    expect(within(dialog).getByRole("link", { name: "Download anyway" })).toHaveAttribute("href", "/api/sow/1");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.click(within(dialog).getByRole("button", { name: "Review it first" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
