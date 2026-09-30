// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const uploadKnowledgeItemAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  uploadKnowledgeItemAction,
}));

const { KnowledgeUpload } = await import("@/components/features/KnowledgeUpload");

const items = [
  {
    id: "item_3",
    type: "NOTE" as const,
    title: null,
    originalFileName: null,
    uploadedAt: new Date("2026-09-30T13:20:00Z"),
    summary: "Launch moved to March; budget up to £120k.",
  },
  {
    id: "item_1",
    type: "NOTE" as const,
    title: "Call notes — 12 Aug",
    originalFileName: null,
    uploadedAt: new Date("2026-08-12T09:00:00Z"),
    summary: null,
  },
  {
    id: "item_2",
    type: "DOCUMENT" as const,
    title: "Brand guidelines",
    originalFileName: "brand-guidelines.pdf",
    uploadedAt: new Date("2026-08-10T09:00:00Z"),
    summary: null,
  },
];

describe("KnowledgeUpload", () => {
  it("has no title field", () => {
    render(<KnowledgeUpload projectId="proj_1" items={[]} />);

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Title, e\.g\./)).not.toBeInTheDocument();
  });

  it("labels an untitled update from its date and time, with its summary alongside", () => {
    render(<KnowledgeUpload projectId="proj_1" items={items} />);

    expect(screen.getByText("Update — 30 Sept 2026, 14:20")).toBeInTheDocument();
    expect(screen.getByText("Launch moved to March; budget up to £120k.")).toBeInTheDocument();
  });

  it("keeps the titles existing updates were saved with, and their type", () => {
    render(<KnowledgeUpload projectId="proj_1" items={items} />);

    expect(screen.getByText("Call notes — 12 Aug")).toBeInTheDocument();
    expect(screen.getAllByText("(Note)")).toHaveLength(2);
    expect(screen.getByText("Brand guidelines")).toBeInTheDocument();
    expect(screen.getByText("(brand-guidelines.pdf)")).toBeInTheDocument();
  });

  it("shows nothing extra when there are no updates yet", () => {
    render(<KnowledgeUpload projectId="proj_1" items={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("defaults to paste mode and switches to a file input in upload mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<KnowledgeUpload projectId="proj_1" items={[]} />);

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

  it("submits pasted notes with no title", async () => {
    const user = userEvent.setup();
    render(<KnowledgeUpload projectId="proj_1" items={[]} />);

    await user.type(
      screen.getByPlaceholderText(/Paste meeting notes or other context/),
      "Client confirmed the launch date."
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(uploadKnowledgeItemAction).toHaveBeenCalled();
    const formData = uploadKnowledgeItemAction.mock.calls[0][2] as FormData;
    expect(formData.get("content")).toBe("Client confirmed the launch date.");
    expect(formData.has("title")).toBe(false);
  });
});
