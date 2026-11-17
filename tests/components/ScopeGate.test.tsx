// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { confirmScopeAction, reopenScopeAction } =
  await import("@/app/(dashboard)/projects/[projectId]/step-actions");
const { ScopeGate, scopeGateWarnings } = await import("@/components/features/ScopeGate");

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
  openQuestions: 0,
  missingMsaRateCard: false,
  clientName: "Fizzy",
  estimateApproved: false,
  projectComplete: false,
};

describe("ScopeGate", () => {
  it("warns about open questions, and still confirms", async () => {
    const user = userEvent.setup();
    render(<ScopeGate {...base} openQuestions={3} />);
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm the scope is ready to estimate?" });
    expect(dialog).toHaveTextContent("3 open questions are still in the scope summary.");
    expect(dialog).not.toHaveTextContent("MSA");
    expect(dialog).toHaveTextContent("You can still confirm.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm scope" }));
    expect(confirm).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("warns about a missing MSA and rate card, naming the client", async () => {
    const user = userEvent.setup();
    render(<ScopeGate {...base} missingMsaRateCard />);
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "No MSA and rate card are set for Fizzy, so the estimate can't be priced yet."
    );
    expect(dialog).not.toHaveTextContent("open question");
    await user.click(within(dialog).getByRole("button", { name: "Confirm scope" }));
    expect(confirm).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("lists both warnings together when both apply", async () => {
    const user = userEvent.setup();
    render(<ScopeGate {...base} openQuestions={1} missingMsaRateCard />);
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("1 open question is still in the scope summary.");
    expect(dialog).toHaveTextContent("No MSA and rate card are set for Fizzy");
  });

  it("shows no warning when there are no open questions and the MSA and rate card are set, and Cancel confirms nothing", async () => {
    const user = userEvent.setup();
    render(<ScopeGate {...base} />);
    await user.click(screen.getByRole("button", { name: "Confirm scope is ready to estimate" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("No open questions, and the MSA and rate card are in place.");
    expect(dialog).not.toHaveTextContent("You can still confirm.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("scopeGateWarnings is empty when nothing is outstanding", () => {
    expect(scopeGateWarnings({ openQuestions: 0, missingMsaRateCard: false, clientName: "Fizzy" })).toEqual(
      []
    );
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
    // The one lock line lives under the stepper; the gate repeats nothing (FB-012).
    const button = screen.getByRole("button", { name: "Reopen scope" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAccessibleDescription();
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(/change request/i)).toBeNull();
  });
});
