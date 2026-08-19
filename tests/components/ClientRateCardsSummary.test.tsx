// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createRateCardAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  createRateCardAction,
}));

const { ClientRateCardsSummary } = await import("@/components/features/ClientRateCardsSummary");

const rateCards = [
  { id: "rc_1", name: "2026 Standard Rates", currency: "GBP", currentVersionFileName: "rates.pdf" },
  { id: "rc_2", name: "Retainer Rates", currency: "USD", currentVersionFileName: null },
];

describe("ClientRateCardsSummary", () => {
  it("shows the empty state when the client has no rate cards", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={[]} canManage={false} />);

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
  });

  it("lists each rate card with a 'current' tag and its filename, without the empty message", () => {
    render(<ClientRateCardsSummary clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByText("2026 Standard Rates (GBP)")).toBeInTheDocument();
    expect(screen.getAllByText("(current)")).toHaveLength(2);
    expect(screen.getByText("rates.pdf")).toBeInTheDocument();
    expect(screen.getByText("Retainer Rates (USD)")).toBeInTheDocument();
    expect(screen.getByText("Not yet uploaded")).toBeInTheDocument();
    expect(screen.queryByText("No rate cards on file yet.")).not.toBeInTheDocument();
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

  it("reveals the create form (name, currency, file, effective dates) when a managing user clicks 'Add rate card'", async () => {
    const user = userEvent.setup();
    render(<ClientRateCardsSummary clientId="client_1" rateCards={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Add rate card" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate card file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });

  it("submits the new rate card via createRateCardAction", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClientRateCardsSummary clientId="client_1" rateCards={[]} canManage={true} />
    );

    await user.click(screen.getByRole("button", { name: "Add rate card" }));
    await user.type(screen.getByLabelText("Name"), "New Rates");
    await user.type(screen.getByLabelText("Currency"), "GBP");
    await user.upload(
      screen.getByLabelText("Rate card file"),
      new File(["contents"], "rates.txt", { type: "text/plain" })
    );
    // fireEvent.submit bypasses jsdom's native file-input constraint
    // validation gate (a jsdom limitation, not a real Browser difference)
    // that would otherwise short-circuit before React's action runs.
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(createRateCardAction).toHaveBeenCalled());
  });
});
