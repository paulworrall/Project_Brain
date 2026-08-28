// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const archiveRateCardAction = vi.fn();
const unarchiveRateCardAction = vi.fn();

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  uploadRateCardVersionAction: vi.fn(),
  revertRateCardVersionAction: vi.fn(),
  archiveRateCardAction,
  unarchiveRateCardAction,
}));

const { RateCardsPanel } = await import("@/components/features/RateCardsPanel");

const rateCards = [
  {
    id: "rc_1",
    name: "2025 Rates",
    currency: "GBP",
    archivedAt: null,
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
    archivedAt: null,
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

// Creating a brand-new named Rate Card lives on the Client detail page
// (ClientRateCardsSummary) now, not here — this component only manages
// version history for Rate Cards that already exist. See
// ClientRateCardsSummary.test.tsx for the "Add rate card" create-form
// coverage.
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

  it("hides all Upload/Revert/Archive controls for a Delivery (non-managing) user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("shows an Upload control on each named rate card for a managing user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    expect(screen.getAllByRole("button", { name: "Upload new version" })).toHaveLength(2);
  });

  it("reveals the version-upload form (file + effective dates) when a managing user clicks Upload", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    await user.click(screen.getAllByRole("button", { name: "Upload new version" })[0]);

    expect(screen.getByLabelText("Rate card file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });

  it("shows an 'Archive' button (not 'Unarchive') for a managing user on a non-archived Rate Card, with no 'Archived' badge", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Unarchive" })).not.toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("shows an 'Archived' badge and an 'Unarchive' button for an archived Rate Card — it stays fully visible, not hidden", () => {
    const archived = [{ ...rateCards[0], archivedAt: new Date("2026-01-01") }];
    render(<RateCardsPanel clientId="client_1" rateCards={archived} canManage={true} />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    // The Rate Card and its versions remain fully rendered, just marked.
    expect(screen.getByText("2025 Rates (GBP)")).toBeInTheDocument();
    expect(screen.getByText("rates-2025.pdf")).toBeInTheDocument();
  });

  it("calls archiveRateCardAction with the right client/rate-card ids when Archive is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<RateCardsPanel clientId="client_1" rateCards={[rateCards[0]]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(archiveRateCardAction).toHaveBeenCalledWith("client_1", "rc_1", undefined, expect.anything());
  });
});
