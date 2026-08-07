// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateOtherServiceLabelAction: vi.fn(),
}));

const { EditableOtherLabel } = await import("@/components/features/EditableOtherLabel");

describe("EditableOtherLabel", () => {
  it("renders the current label as a click-to-edit button", () => {
    render(<EditableOtherLabel projectId="proj_1" label="Legal & Compliance" />);

    expect(screen.getByRole("button", { name: "Legal & Compliance" })).toBeInTheDocument();
  });

  it("switches to an editable input with the current value when clicked", async () => {
    const user = userEvent.setup();
    render(<EditableOtherLabel projectId="proj_1" label="Legal & Compliance" />);

    await user.click(screen.getByRole("button", { name: "Legal & Compliance" }));

    expect(screen.getByDisplayValue("Legal & Compliance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("returns to the button view without saving when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<EditableOtherLabel projectId="proj_1" label="Legal & Compliance" />);

    await user.click(screen.getByRole("button", { name: "Legal & Compliance" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Legal & Compliance" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Legal & Compliance")).not.toBeInTheDocument();
  });
});
