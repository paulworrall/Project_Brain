// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  createRateCardAction: vi.fn(),
  archiveRateCardAction: vi.fn(),
}));

const { RateCardsPanel } = await import("@/components/features/RateCardsPanel");

const rateCards = [
  {
    id: "rc_1",
    name: "2025 Rates",
    currency: "GBP",
    effectiveFrom: new Date("2025-01-01"),
    effectiveTo: new Date("2025-12-31"),
    status: "ARCHIVED" as const,
  },
  {
    id: "rc_2",
    name: "2026 Standard Rates",
    currency: "USD",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    status: "ACTIVE" as const,
  },
];

describe("RateCardsPanel", () => {
  it("shows a 'no rate cards' message when there are none", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={[]} canManage={false} />);

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
  });

  it("lists every rate card with its name, currency, and status badge", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByText(/2025 Rates/)).toBeInTheDocument();
    expect(screen.getByText("(GBP)")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText(/2026 Standard Rates/)).toBeInTheDocument();
    expect(screen.getByText("(USD)")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("hides the 'Add rate card' control and all Archive buttons for a Delivery (non-managing) user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.queryByRole("button", { name: "Add rate card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("shows 'Add rate card' and an Archive button only on the Active card, for a managing user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    expect(screen.getByRole("button", { name: "Add rate card" })).toBeInTheDocument();
    // Only the one Active rate card gets an Archive control — the Archived one doesn't.
    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(1);
  });

  it("reveals the add form (name, currency, file, effective dates) when the managing user clicks the button", async () => {
    const user = userEvent.setup();
    render(<RateCardsPanel clientId="client_1" rateCards={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Add rate card" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate card file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });
});
