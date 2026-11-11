// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChecklistItemView } from "@/components/features/ChecklistView";

const toggleChecklistItemAction = vi.fn(async () => undefined);
const updateChecklistItemDetailAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  toggleChecklistItemAction,
  updateChecklistItemDetailAction,
}));

const { EditableChecklist } = await import("@/components/features/EditableChecklist");

beforeEach(() => {
  toggleChecklistItemAction.mockClear();
  updateChecklistItemDetailAction.mockClear();
});

const items: ChecklistItemView[] = [
  { id: "item_1", label: "Set up Workbook entry", isComplete: false, detailText: null },
  { id: "item_2", label: "Assign job code", isComplete: true, detailText: "FIZ-2026-014" },
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

  it("shows a message when there are no checklist items or checks", () => {
    render(<EditableChecklist projectId="proj_1" items={[]} />);

    expect(screen.getByText("No checklist items yet.")).toBeInTheDocument();
  });

  it("re-syncs to a prop update, so a second rendered copy reflects a toggle made elsewhere", () => {
    // A re-render with a changed `isComplete` prop is what a
    // `revalidatePath()` refresh looks like after a toggle.
    const withItemComplete = (isComplete: boolean): ChecklistItemView[] => [
      { id: "item_1", label: "Set up Workbook entry", isComplete, detailText: null },
    ];

    const { rerender } = render(
      <EditableChecklist projectId="proj_1" items={withItemComplete(false)} />
    );
    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).not.toBeChecked();

    rerender(<EditableChecklist projectId="proj_1" items={withItemComplete(true)} />);

    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).toBeChecked();
  });

  it("shows the detail text field pre-filled, editable regardless of completion state", () => {
    render(<EditableChecklist projectId="proj_1" items={items} />);

    const notCompleteDetail = screen.getByLabelText("Set up Workbook entry detail");
    const completeDetail = screen.getByLabelText("Assign job code detail");

    expect(notCompleteDetail).not.toBeDisabled();
    expect(notCompleteDetail).toHaveValue("");
    expect(completeDetail).not.toBeDisabled();
    expect(completeDetail).toHaveValue("FIZ-2026-014");
  });

  it("submits the detail action on blur, independently of the checkbox", async () => {
    const user = userEvent.setup();
    render(<EditableChecklist projectId="proj_1" items={items} />);

    const detailField = screen.getByLabelText("Set up Workbook entry detail");
    await user.type(detailField, "FIZ-2026-099");
    await user.tab();

    expect(updateChecklistItemDetailAction).toHaveBeenCalled();
    expect(toggleChecklistItemAction).not.toHaveBeenCalled();
  });
});

describe("EditableChecklist as a step's readiness list (FB-008)", () => {
  it("is titled 'Before you move on' and shows system checks read-only above the items", () => {
    render(
      <EditableChecklist
        projectId="proj_1"
        items={items}
        step="brief"
        systemChecks={[
          { id: "brief-submitted", label: "Brief submitted", met: true },
          { id: "msa-rate-card", label: "MSA and rate card set on the project", met: false },
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: "Before you move on" })).toBeInTheDocument();
    const auto = screen.getByRole("list", { name: "Automatic checks" });
    expect(auto).toHaveTextContent("Brief submittedDone");
    expect(auto).toHaveTextContent("MSA and rate card set on the projectNot yet");
  });

  it("lets the PM move an item to another step", async () => {
    const { setChecklistItemStepAction } = await import("@/app/(dashboard)/projects/[projectId]/step-actions");
    const user = userEvent.setup();
    render(<EditableChecklist projectId="proj_1" items={items} step="brief" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Step for Set up Workbook entry" }), "sow");
    expect(setChecklistItemStepAction).toHaveBeenCalledWith({ projectId: "proj_1", itemId: "item_1", step: "sow" });
  });

  it("adds a new item to the step it is shown in", async () => {
    const { addChecklistItemAction } = await import("@/app/(dashboard)/projects/[projectId]/step-actions");
    const user = userEvent.setup();
    render(<EditableChecklist projectId="proj_1" items={items} step="estimate" />);
    await user.type(screen.getByLabelText("New item"), "Book estimation session");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(addChecklistItemAction).toHaveBeenCalledWith({
      projectId: "proj_1",
      label: "Book estimation session",
      step: "estimate",
    });
  });

  it("is read-only once the project is complete: no ticking, editing, moving or adding", () => {
    render(<EditableChecklist projectId="proj_1" items={items} step="brief" readOnly />);
    expect(screen.getByRole("checkbox", { name: "Set up Workbook entry" })).toBeDisabled();
    expect(screen.getByLabelText("Set up Workbook entry detail")).toHaveAttribute("readonly");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  });
});
