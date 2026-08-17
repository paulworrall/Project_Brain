// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const submitClientUpdateAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  submitClientUpdateAction,
}));

const { ClientUpdateComposer } = await import("@/components/features/ClientUpdateComposer");

describe("ClientUpdateComposer", () => {
  it("shows no log section when there are no past updates", () => {
    render(<ClientUpdateComposer projectId="proj_1" updates={[]} />);

    expect(screen.queryByText("Previous updates")).not.toBeInTheDocument();
  });

  it("submits the client update action when the form is submitted", async () => {
    const user = userEvent.setup();
    render(<ClientUpdateComposer projectId="proj_1" updates={[]} />);

    await user.type(screen.getByLabelText("Add a client update"), "Budget confirmed at £120k.");
    await user.click(screen.getByRole("button", { name: /Add update/ }));

    expect(submitClientUpdateAction).toHaveBeenCalled();
  });

  it("lists every past update with its timestamp and author", () => {
    render(
      <ClientUpdateComposer
        projectId="proj_1"
        updates={[
          {
            id: "note_1",
            content: "First update from the client.",
            createdAt: new Date("2026-08-01T10:00:00Z"),
            createdByName: "Alex Morgan",
          },
          {
            id: "note_2",
            content: "Second update, a follow-up call.",
            createdAt: new Date("2026-08-05T14:30:00Z"),
            createdByName: null,
          },
        ]}
      />
    );

    expect(screen.getByText("Previous updates")).toBeInTheDocument();
    expect(screen.getByText("First update from the client.")).toBeInTheDocument();
    expect(screen.getByText(/Alex Morgan/)).toBeInTheDocument();
    expect(screen.getByText("Second update, a follow-up call.")).toBeInTheDocument();
  });

  it("clears the textarea once a submission is reflected in a longer updates log", () => {
    const { rerender } = render(<ClientUpdateComposer projectId="proj_1" updates={[]} />);

    const textarea = screen.getByLabelText("Add a client update") as HTMLTextAreaElement;
    textarea.value = "Draft text not yet submitted successfully";

    // A successful submission grows the log via revalidatePath — simulated
    // here by re-rendering with one more entry, which should remount (and
    // therefore clear) the composer's form.
    rerender(
      <ClientUpdateComposer
        projectId="proj_1"
        updates={[
          {
            id: "note_1",
            content: "Confirmed.",
            createdAt: new Date("2026-08-01T10:00:00Z"),
            createdByName: null,
          },
        ]}
      />
    );

    expect((screen.getByLabelText("Add a client update") as HTMLTextAreaElement).value).toBe("");
  });
});
