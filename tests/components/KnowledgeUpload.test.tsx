// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const uploadKnowledgeItemAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  uploadKnowledgeItemAction,
}));

const { KnowledgeUpload } = await import("@/components/features/KnowledgeUpload");

// Oldest first, as getVersionHistory returns them; the panel shows newest first.
const versions = [
  {
    id: "brief",
    versionNumber: 1,
    label: "Initial brief",
    source: "CLIENT" as const,
    createdAt: new Date("2026-08-01T09:00:00Z"),
    detail: "brief.pdf",
    summary: null,
    changeSummary: null,
  },
  {
    id: "item_1",
    versionNumber: 2,
    label: "Call notes — 12 Aug (Note)",
    source: "CLIENT" as const,
    createdAt: new Date("2026-08-12T09:00:00Z"),
    detail: null,
    summary: null,
    changeSummary: null,
  },
  {
    id: "item_3",
    versionNumber: 3,
    label: "Update — 30 Sept 2026, 14:20 (Note)",
    source: "INTERNAL_TEAM" as const,
    createdAt: new Date("2026-09-30T13:20:00Z"),
    detail: null,
    summary: "Launch moved to March; budget up to £120k.",
    changeSummary: "Budget increased; new milestone added.",
  },
];

describe("KnowledgeUpload", () => {
  it("has no title field", () => {
    render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Title, e\.g\./)).not.toBeInTheDocument();
  });

  it("asks where the update came from — Client by default, or Internal team", () => {
    render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

    const source = screen.getByRole("radiogroup", { name: "From" });
    expect(within(source).getByRole("radio", { name: "Client" })).toBeChecked();
    expect(within(source).getByRole("radio", { name: "Internal team" })).not.toBeChecked();
  });

  describe("version history", () => {
    it("is collapsed by default: one compact 'Latest' line, and no list below the update input", () => {
      render(<KnowledgeUpload projectId="proj_1" versions={versions} />);

      expect(screen.getByText(/Latest:/)).toHaveTextContent("Latest: v3 · 30 Sept 2026, 14:20 · View history (3)");
      expect(screen.getByRole("button", { name: "View history (3)" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Version history" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText("Initial brief")).not.toBeInTheDocument();
    });

    it("opens a drawer listing every version newest first, with label and date on one line, source as a tag, and the Changed summary kept", async () => {
      const user = userEvent.setup();
      render(<KnowledgeUpload projectId="proj_1" versions={versions} />);

      await user.click(screen.getByRole("button", { name: "View history (3)" }));

      const dialog = screen.getByRole("dialog", { name: "Version history" });
      const rows = within(within(dialog).getByRole("list", { name: "Version history" })).getAllByRole("listitem");
      expect(rows).toHaveLength(3);

      expect(rows[0]).toHaveTextContent("v3");
      expect(rows[0]).toHaveTextContent("Update — 30 Sept 2026, 14:20 (Note)");
      expect(rows[0]).toHaveTextContent("Internal team");
      expect(rows[0]).toHaveTextContent("Launch moved to March; budget up to £120k.");
      expect(rows[0]).toHaveTextContent("Changed: Budget increased; new milestone added.");

      expect(rows[1]).toHaveTextContent("v2");
      expect(rows[1]).toHaveTextContent("Call notes — 12 Aug (Note)");
      expect(rows[1]).toHaveTextContent("12 Aug 2026");
      expect(rows[1]).toHaveTextContent("Client");

      expect(rows[2]).toHaveTextContent("v1");
      expect(rows[2]).toHaveTextContent("Initial brief");
      expect(rows[2]).toHaveTextContent("brief.pdf");
    });

    it("moves focus into the drawer on open, and returns it to the trigger on Escape", async () => {
      const user = userEvent.setup();
      render(<KnowledgeUpload projectId="proj_1" versions={versions} />);
      const trigger = screen.getByRole("button", { name: "View history (3)" });

      await user.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "Version history" });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("returns focus to the trigger when closed with the Close button, and keeps Tab inside the drawer", async () => {
      const user = userEvent.setup();
      render(<KnowledgeUpload projectId="proj_1" versions={versions} />);
      const trigger = screen.getByRole("button", { name: "View history (3)" });

      await user.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "Version history" });
      await user.tab();
      await user.tab();
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);

      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("clamps a long note to two lines with 'Show more', and expands it", async () => {
      const long = "The client restated the budget and moved the launch. ".repeat(6).trim();
      const user = userEvent.setup();
      render(
        <KnowledgeUpload
          projectId="proj_1"
          versions={[...versions.slice(0, 2), { ...versions[2], summary: long }]}
        />
      );
      await user.click(screen.getByRole("button", { name: "View history (3)" }));

      const note = screen.getByText(long);
      expect(note.className).toMatch(/line-clamp-2/);
      const more = screen.getByRole("button", { name: "Show more" });
      expect(more).toHaveAttribute("aria-expanded", "false");

      await user.click(more);

      expect(note.className).not.toMatch(/line-clamp-2/);
      expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    });

    it("offers no 'Show more' for a short note", async () => {
      const user = userEvent.setup();
      render(<KnowledgeUpload projectId="proj_1" versions={versions} />);
      await user.click(screen.getByRole("button", { name: "View history (3)" }));

      expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("shows nothing — no line, no button — when there's no history yet", () => {
      render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

      expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /View history/ })).not.toBeInTheDocument();
    });
  });

  it("defaults to paste mode and switches to a file input in upload mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

    expect(
      screen.getByPlaceholderText(/Paste meeting notes or other context/)
    ).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));

    expect(
      screen.queryByPlaceholderText(/Paste meeting notes or other context/)
    ).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it("submits pasted notes with their source and no title", async () => {
    const user = userEvent.setup();
    render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

    await user.click(screen.getByRole("radio", { name: "Internal team" }));
    await user.type(
      screen.getByPlaceholderText(/Paste meeting notes or other context/),
      "Team agreed the approach."
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(uploadKnowledgeItemAction).toHaveBeenCalled();
    const formData = uploadKnowledgeItemAction.mock.calls[0][2] as FormData;
    expect(formData.get("content")).toBe("Team agreed the approach.");
    expect(formData.get("source")).toBe("INTERNAL_TEAM");
    expect(formData.has("title")).toBe(false);
  });
});
