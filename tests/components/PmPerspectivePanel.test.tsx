// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updatePmPerspectiveFieldAction = vi.fn(async () => undefined);
vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updatePmPerspectiveFieldAction,
}));

const { PmPerspectivePanel } = await import("@/components/features/PmPerspectivePanel");
const { pmPerspectiveView } = await import("../fixtures/pmPerspective");

describe("PmPerspectivePanel", () => {
  it("is its own clearly labelled panel, marked as the PM's view and not the client's", () => {
    render(<PmPerspectivePanel projectId="proj_1" fields={pmPerspectiveView()} />);

    const panel = screen.getByRole("region", { name: "PM perspective" });
    expect(within(panel).getByText("PM's view — not from the client")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Nothing here is ever presented as the client's words/)
    ).toBeInTheDocument();
  });

  it("shows each field's content with who last edited it and when", () => {
    render(
      <PmPerspectivePanel
        projectId="proj_1"
        fields={pmPerspectiveView({
          initialThoughts: {
            content: "Second project with this client.",
            updatedAt: new Date("2026-09-23T10:00:00Z"),
            updatedByName: "Pat PM",
          },
        })}
      />
    );

    expect(
      screen.getByText("Second project with this client.", { selector: "p" })
    ).toBeInTheDocument();
    expect(screen.getByText("Last edited 23 Sept 2026 by Pat PM")).toBeInTheDocument();
    expect(screen.getAllByText("Not added yet")).toHaveLength(1);
    expect(screen.getByText("1 of 2 filled in.", { exact: false })).toBeInTheDocument();
  });

  it("encourages the PM to fill in empty fields with each field's helper prompt", () => {
    render(<PmPerspectivePanel projectId="proj_1" fields={pmPerspectiveView()} />);
    expect(screen.getByText(/Add your own read of the brief/)).toBeInTheDocument();
    expect(
      screen.getAllByText("Your early view of the approach, however rough.").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Add →")).toHaveLength(2);
  });

  it("stays editable — saving submits the field's new content to the edit action", async () => {
    const user = userEvent.setup();
    render(
      <PmPerspectivePanel
        projectId="proj_1"
        fields={pmPerspectiveView({ proposedSolution: { content: "Phased rollout." } })}
      />
    );

    await user.click(screen.getByText("Edit"));
    const textarea = screen.getByLabelText("Proposed solution");
    await user.clear(textarea);
    await user.type(textarea, "Big-bang launch.");
    await user.click(within(textarea.closest("form")!).getByRole("button", { name: "Save" }));

    expect(updatePmPerspectiveFieldAction).toHaveBeenCalledTimes(1);
    const [projectId, fieldId, , formData] = updatePmPerspectiveFieldAction.mock
      .calls[0] as unknown as [string, string, unknown, FormData];
    expect(projectId).toBe("proj_1");
    expect(fieldId).toBe("proposedSolution");
    expect(formData.get("content")).toBe("Big-bang launch.");
  });
});
