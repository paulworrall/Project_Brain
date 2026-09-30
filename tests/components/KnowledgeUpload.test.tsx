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

  it("lists every version, newest first, with its number, label, source, date and summaries", () => {
    render(<KnowledgeUpload projectId="proj_1" versions={versions} />);

    const rows = within(screen.getByRole("list", { name: "Version history" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent("v3");
    expect(rows[0]).toHaveTextContent("Update — 30 Sept 2026, 14:20 (Note)");
    expect(rows[0]).toHaveTextContent("Internal team");
    expect(rows[0]).toHaveTextContent("Launch moved to March; budget up to £120k.");
    expect(rows[0]).toHaveTextContent("Changed: Budget increased; new milestone added.");

    expect(rows[1]).toHaveTextContent("v2");
    expect(rows[1]).toHaveTextContent("Call notes — 12 Aug (Note)");
    expect(rows[1]).toHaveTextContent("Client");
    expect(rows[1]).toHaveTextContent("12 Aug 2026");

    expect(rows[2]).toHaveTextContent("v1");
    expect(rows[2]).toHaveTextContent("Initial brief");
    expect(rows[2]).toHaveTextContent("brief.pdf");
  });

  it("shows no history when there's nothing yet", () => {
    render(<KnowledgeUpload projectId="proj_1" versions={[]} />);

    expect(screen.queryByRole("list", { name: "Version history" })).not.toBeInTheDocument();
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
