// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  createRateCardAction: vi.fn(),
  uploadRateCardVersionAction: vi.fn(),
  revertRateCardVersionAction: vi.fn(),
}));

const { RateCardsPanel } = await import("@/components/features/RateCardsPanel");

const rateCards = [
  {
    id: "rc_1",
    name: "2025 Rates",
    currency: "GBP",
    versions: [
      {
        id: "rc1v1",
        versionNumber: 1,
        status: "ENABLED" as const,
        fileName: "rates-2025.pdf",
        uploadedByName: null,
        uploadedAt: new Date("2025-01-01"),
        effectiveFrom: new Date("2025-01-01"),
        effectiveTo: new Date("2025-12-31"),
      },
    ],
  },
  {
    id: "rc_2",
    name: "2026 Standard Rates",
    currency: "USD",
    versions: [
      {
        id: "rc2v1",
        versionNumber: 1,
        status: "DISABLED" as const,
        fileName: "rates-2026-draft.pdf",
        uploadedByName: null,
        uploadedAt: new Date("2025-11-01"),
        effectiveFrom: new Date("2025-11-01"),
        effectiveTo: null,
      },
      {
        id: "rc2v2",
        versionNumber: 2,
        status: "ENABLED" as const,
        fileName: "rates-2026-final.pdf",
        uploadedByName: null,
        uploadedAt: new Date("2026-01-01"),
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
      },
    ],
  },
];

describe("RateCardsPanel", () => {
  it("shows a 'no rate cards' message when there are none", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={[]} canManage={false} />);

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
  });

  it("renders one VersionHistory panel per named rate card, each showing its name/currency and current version", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByText("2025 Rates (GBP)")).toBeInTheDocument();
    expect(screen.getByText("rates-2025.pdf")).toBeInTheDocument();
    expect(screen.getByText("2026 Standard Rates (USD)")).toBeInTheDocument();
    expect(screen.getByText("rates-2026-final.pdf")).toBeInTheDocument();
    // The disabled draft version is collapsed behind its own toggle, not shown by default.
    expect(screen.getByText(/rates-2026-draft\.pdf/)).not.toBeVisible();
  });

  it("hides the 'Add rate card' control and all Upload/Revert controls for a Delivery (non-managing) user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.queryByRole("button", { name: "Add rate card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
  });

  it("shows 'Add rate card' for a managing user, plus an Upload control on each named rate card", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    expect(screen.getByRole("button", { name: "Add rate card" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Upload new version" })).toHaveLength(2);
  });

  it("reveals the create form (name, currency, file, effective dates) when the managing user clicks 'Add rate card'", async () => {
    const user = userEvent.setup();
    render(<RateCardsPanel clientId="client_1" rateCards={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Add rate card" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate card file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });
});
