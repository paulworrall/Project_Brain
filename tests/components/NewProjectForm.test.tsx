// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getRateCardsForWorkstreamAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/new/actions", () => ({
  createProjectAction: vi.fn(),
  getRateCardsForWorkstreamAction,
}));

const { NewProjectForm } = await import("@/app/(dashboard)/projects/new/NewProjectForm");

const workstreamOptions = [
  { id: "ws_1", label: "Coffee / Coffee Loyalty App" },
  { id: "ws_2", label: "Fizzy / Fizzy Refresh 2026" },
];

describe("NewProjectForm", () => {
  it("disables the Rate card select with a 'select a workstream first' hint before any Workstream is chosen", () => {
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    const rateCardSelect = screen.getByLabelText("Rate card (optional)");
    expect(rateCardSelect).toBeDisabled();
    expect(screen.getByText("Select a workstream first")).toBeInTheDocument();
    expect(getRateCardsForWorkstreamAction).not.toHaveBeenCalled();
  });

  it("fetches and shows only that Workstream's Client's Rate Cards once one is selected", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([
      { id: "rc_1", name: "2026 Standard Rates", currency: "GBP" },
    ]);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_1");

    expect(getRateCardsForWorkstreamAction).toHaveBeenCalledWith("ws_1");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "2026 Standard Rates (GBP)" })).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Rate card (optional)")).toBeEnabled();
  });

  it("shows a 'no rate cards for this client' hint and keeps the select disabled when the Client has none", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_2");

    await waitFor(() =>
      expect(screen.getByText("No rate cards for this client")).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Rate card (optional)")).toBeDisabled();
  });

  it("clears the previous Workstream's Rate Card options when switching to a different Workstream", async () => {
    getRateCardsForWorkstreamAction
      .mockResolvedValueOnce([{ id: "rc_1", name: "Coffee Rates", currency: "GBP" }])
      .mockResolvedValueOnce([{ id: "rc_2", name: "Fizzy Rates", currency: "USD" }]);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_1");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Coffee Rates (GBP)" })).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_2");

    // The first Client's rate card must never remain selectable once a
    // different Workstream (a different Client) is chosen.
    expect(screen.queryByRole("option", { name: "Coffee Rates (GBP)" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Fizzy Rates (USD)" })).toBeInTheDocument()
    );
  });
});
