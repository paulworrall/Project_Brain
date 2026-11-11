// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { confirmScopeAction, reopenScopeAction } =
  await import("@/app/(dashboard)/projects/[projectId]/step-actions");
const { ScopeGate } = await import("@/components/features/ScopeGate");

const confirm = confirmScopeAction as ReturnType<typeof vi.fn>;
const reopen = reopenScopeAction as ReturnType<typeof vi.fn>;

beforeEach(() => {
  confirm.mockClear();
  reopen.mockClear();
});

const base = {
  projectId: "p1",
  scopeConfirmedAt: null,
  scopeConfirmedByName: null,
  outstanding: [] as string[],
  estimateApproved: false,
  projectComplete: false,
};

describe("ScopeGate", () => {
  it("opens a confirmation dialog listing unticked readiness items as a warning, and still confirms", async () => {
    const user = userEvent.setup();
    render(
      <ScopeGate
        {...base}
        outstanding={["MSA and rate card set on the project", "Assign job code"]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm the scope is ready to estimate?" });
    expect(dialog).toHaveTextContent("2 readiness items aren't done yet:");
    expect(within(dialog).getByText("Assign job code")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("You can still confirm.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm scope" }));
    expect(confirm).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("says when every readiness item is done, and Cancel confirms nothing", async () => {
    const user = userEvent.setup();
    render(<ScopeGate {...base} />);
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Every Brief readiness item is done.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("after confirmation shows when and who, with a low-emphasis Reopen scope", async () => {
    const user = userEvent.setup();
    render(
      <ScopeGate {...base} scopeConfirmedAt="2026-11-03T10:00:00Z" scopeConfirmedByName="Pat PM" />
    );
    expect(screen.getByText(/Scope confirmed 3 Nov by Pat PM/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm scope is ready to estimate" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reopen scope" }));
    expect(reopen).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("disables Reopen scope once an estimate is approved, with the change-request note", () => {
    render(<ScopeGate {...base} scopeConfirmedAt="2026-11-03T10:00:00Z" estimateApproved />);
    const button = screen.getByRole("button", { name: "Reopen scope" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "The client has approved an estimate, so the scope can't be reopened. Changes will need a change request (coming soon)."
    );
  });

  it("disables Reopen scope on a complete project", () => {
    render(
      <ScopeGate
        {...base}
        scopeConfirmedAt="2026-11-03T10:00:00Z"
        estimateApproved
        projectComplete
      />
    );
    expect(screen.getByRole("button", { name: "Reopen scope" })).toHaveAccessibleDescription(
      "This project is complete. Changes will need a change request (coming soon)."
    );
  });
});
