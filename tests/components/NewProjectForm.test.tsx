// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getRateCardsForWorkstreamAction = vi.fn();
const getMasterServiceAgreementForWorkstreamAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/new/actions", () => ({
  createProjectAction: vi.fn(),
  getRateCardsForWorkstreamAction,
  getMasterServiceAgreementForWorkstreamAction,
}));

const { NewProjectForm } = await import("@/app/(dashboard)/projects/new/NewProjectForm");

const workstreamOptions = [
  { id: "ws_1", label: "Coffee / Coffee Loyalty App" },
  { id: "ws_2", label: "Fizzy / Fizzy Refresh 2026" },
];

const msaOption = { id: "msa_1", fileName: "coffee-msa.pdf", effectiveFrom: new Date("2026-01-01") };

beforeEach(() => {
  getRateCardsForWorkstreamAction.mockReset();
  getMasterServiceAgreementForWorkstreamAction.mockReset();
  // Every test below picks a Workstream, which always triggers both fetches
  // together (phase 3: the MSA select is required alongside the Rate Card
  // one) — default the MSA one to "found" so tests focused on Rate Card
  // behavior aren't also exercising the "no MSA" blocked-submission path
  // unless they explicitly override it.
  getMasterServiceAgreementForWorkstreamAction.mockResolvedValue(msaOption);
});

describe("NewProjectForm — Rate Card select", () => {
  it("disables the Rate card select with a 'select a workstream first' hint before any Workstream is chosen", () => {
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    const rateCardSelect = screen.getByLabelText("Rate card (optional)");
    expect(rateCardSelect).toBeDisabled();
    // Both the Rate Card and MSA selects share this placeholder text before
    // a Workstream is chosen — scope to the Rate Card select specifically.
    expect(rateCardSelect).toHaveTextContent("Select a workstream first");
    expect(getRateCardsForWorkstreamAction).not.toHaveBeenCalled();
  });

  it("fetches and shows only that Workstream's Client's Rate Cards once one is selected", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([
      { id: "rc_1", name: "2026 Standard Rates", currency: "GBP", versions: [] },
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
      .mockResolvedValueOnce([{ id: "rc_1", name: "Coffee Rates", currency: "GBP", versions: [] }])
      .mockResolvedValueOnce([{ id: "rc_2", name: "Fizzy Rates", currency: "USD", versions: [] }]);
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

  it("presents a version select, pre-selecting the version flagged current, once a Rate Card with versions is chosen", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([
      {
        id: "rc_1",
        name: "2026 Standard Rates",
        currency: "GBP",
        versions: [
          {
            id: "rcv_2",
            versionNumber: 2,
            fileName: "rates-v2.pdf",
            effectiveFrom: new Date("2026-06-01"),
            effectiveTo: null,
            status: "DISABLED",
          },
          {
            id: "rcv_1",
            versionNumber: 1,
            fileName: "rates-v1.pdf",
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: null,
            status: "ENABLED",
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_1");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "2026 Standard Rates (GBP)" })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByLabelText("Rate card (optional)"), "rc_1");

    const versionSelect = await screen.findByLabelText("Rate card version");
    expect(versionSelect).toHaveValue("rcv_1");
    expect(
      screen.getByRole("option", { name: "Version 1 — rates-v1.pdf (current)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Version 2 — rates-v2.pdf" })).toBeInTheDocument();
  });
});

describe("NewProjectForm — Master Service Agreement select", () => {
  it("disables the MSA select with a 'select a workstream first' hint before any Workstream is chosen, and keeps submission disabled", () => {
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    const msaSelect = screen.getByLabelText("Master Service Agreement");
    expect(msaSelect).toBeDisabled();
    // Both the MSA and Rate Card selects share this placeholder text before
    // a Workstream is chosen — scope to the MSA select specifically.
    expect(msaSelect).toHaveTextContent("Select a workstream first");
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  it("shows the Client's active MSA once a Workstream is selected, and enables submission", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_1");

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "coffee-msa.pdf (effective from 1 Jan 2026)" })
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Master Service Agreement")).toHaveValue("msa_1");
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });

  it("blocks submission with a clear explanatory message when the Client has no MSA on file", async () => {
    getRateCardsForWorkstreamAction.mockResolvedValueOnce([]);
    getMasterServiceAgreementForWorkstreamAction.mockReset();
    getMasterServiceAgreementForWorkstreamAction.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    render(<NewProjectForm workstreamOptions={workstreamOptions} />);

    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_1");

    await waitFor(() =>
      expect(
        screen.getByText(/This client has no Master Service Agreement on file/i)
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Master Service Agreement")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });
});
