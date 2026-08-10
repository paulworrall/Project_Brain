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
  { id: "item_1", type: "NOTE" as const, title: "Call notes — 12 Aug", originalFileName: null },
  {
    id: "item_2",
    type: "DOCUMENT" as const,
    title: "Brand guidelines",
    originalFileName: "brand-guidelines.pdf",
  },
];

describe("KnowledgeUpload", () => {
  it("lists existing knowledge items with their type", () => {
    render(<KnowledgeUpload projectId="proj_1" items={items} />);

    expect(screen.getByText("Call notes — 12 Aug")).toBeInTheDocument();
    expect(screen.getByText("(Note)")).toBeInTheDocument();
    expect(screen.getByText("Brand guidelines")).toBeInTheDocument();
    expect(screen.getByText("(brand-guidelines.pdf)")).toBeInTheDocument();
  });

  it("shows nothing extra when there are no knowledge items yet", () => {
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

  it("submits the upload action with the title and pasted content", async () => {
    const user = userEvent.setup();
    render(<KnowledgeUpload projectId="proj_1" items={[]} />);

    await user.type(screen.getByPlaceholderText(/Title, e.g\./), "Kick-off call notes");
    await user.type(
      screen.getByPlaceholderText(/Paste meeting notes or other context/),
      "Client confirmed the launch date."
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(uploadKnowledgeItemAction).toHaveBeenCalled();
  });
});
