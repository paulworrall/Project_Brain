// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChecklistItemView } from "@/components/features/ChecklistView";

const toggleChecklistItemAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  toggleChecklistItemAction,
}));

const { EditableChecklist } = await import("@/components/features/EditableChecklist");

const items = [
  { id: "item_1", label: "Set up Workbook entry", isComplete: false },
  { id: "item_2", label: "Assign job code", isComplete: true },
];

describe("EditableChecklist", () => {
  it("renders each item with its checked state", () => {
    render(<EditableChecklist projectId="proj_1" items={items} />);

    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Assign job code" })).toBeChecked();
  });

  it("shows the not-yet-complete label without a strikethrough and the complete one with it", () => {
    render(<EditableChecklist projectId="proj_1" items={items} />);

    expect(screen.getByText("Set up Workbook entry")).not.toHaveClass("line-through");
    expect(screen.getByText("Assign job code")).toHaveClass("line-through");
  });

  it("submits the toggle action when a checkbox is clicked", async () => {
    const user = userEvent.setup();
    render(<EditableChecklist projectId="proj_1" items={items} />);

    await user.click(screen.getByRole("checkbox", { name: "Set up Workbook entry" }));

    expect(toggleChecklistItemAction).toHaveBeenCalled();
  });

  it("shows a message when there are no checklist items", () => {
    render(<EditableChecklist projectId="proj_1" items={[]} />);

    expect(screen.getByText("No checklist items yet.")).toBeInTheDocument();
  });

  it("re-syncs to a prop update, so a second rendered copy reflects a toggle made elsewhere", () => {
    // This checklist renders in two places (Step 1 and the sidebar) bound to
    // the same server data. A re-render with a changed `isComplete` prop is
    // what a `revalidatePath()` refresh looks like from the other copy's toggle.
    const withItemComplete = (isComplete: boolean): ChecklistItemView[] => [
      { id: "item_1", label: "Set up Workbook entry", isComplete },
    ];

    const { rerender } = render(
      <EditableChecklist projectId="proj_1" items={withItemComplete(false)} />
    );
    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).not.toBeChecked();

    rerender(<EditableChecklist projectId="proj_1" items={withItemComplete(true)} />);

    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).toBeChecked();
  });
});
