// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createRateCardAction = vi.fn(async (): Promise<{ message?: string } | undefined> => undefined);

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  createRateCardAction,
  uploadRateCardVersionAction: vi.fn(),
  previewRateCardUploadAction: vi.fn(),
}));

const { ClientRateCardsSummary } = await import("@/components/features/ClientRateCardsSummary");

const rateCards = [
  { id: "rc_1", name: "2026 Standard Rates", currency: "GBP", currentVersionFileName: "rates.pdf", currentVersionCurrencies: ["EUR", "GBP"] },
  { id: "rc_2", name: "Retainer Rates", currency: "USD", currentVersionFileName: null, currentVersionCurrencies: [] },
];

describe("ClientRateCardsSummary", () => {
  it("shows the empty state when the client has no rate cards", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={[]} canManage={false} />);

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
  });

  it("lists each rate card with a 'current' tag and its filename, without the empty message", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByText("2026 Standard Rates (GBP)")).toBeInTheDocument();
    expect(screen.getByText("(current · EUR, GBP)")).toBeInTheDocument();
    expect(screen.getByText("(current)")).toBeInTheDocument();
    expect(screen.getByText("rates.pdf")).toBeInTheDocument();
    expect(screen.getByText("Retainer Rates (USD)")).toBeInTheDocument();
    expect(screen.getByText("Not yet uploaded")).toBeInTheDocument();
    expect(screen.queryByText("No rate cards on file yet.")).not.toBeInTheDocument();
  });

  it("omits the '(currency)' suffix entirely for a rate card with no currency set", () => {
    render(
      <ClientRateCardsSummary
        clientId="client_1"
        rateCards={[{ id: "rc_3", name: "No Currency Rates", currency: null, currentVersionFileName: "rates.pdf", currentVersionCurrencies: [] }]}
        canManage={false}
      />
    );

    expect(screen.getByText("No Currency Rates")).toBeInTheDocument();
    expect(screen.queryByText(/No Currency Rates \(/)).not.toBeInTheDocument();
  });

  it("links 'Manage in library' to the Rate Cards library", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByRole("link", { name: /Manage in library/ })).toHaveAttribute(
      "href",
      "/rate-cards"
    );
  });

  it("hides the 'Add rate card' control for a non-managing (Delivery) user", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.queryByRole("button", { name: "Add rate card" })).not.toBeInTheDocument();
  });


  it("reveals the Excel upload flow (name, .xlsx file, template link) when a managing user clicks 'Add rate card'", async () => {
    const user = userEvent.setup();
    render(<ClientRateCardsSummary clientId="client_1" rateCards={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Add rate card" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate card file (.xlsx)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download template" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Currency (optional)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Effective from")).not.toBeInTheDocument();
  });
});
