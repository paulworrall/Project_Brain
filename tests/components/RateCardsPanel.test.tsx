// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const createRateCardAction = vi.fn();
const archiveRateCardAction = vi.fn();
const unarchiveRateCardAction = vi.fn();

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  uploadRateCardVersionAction: vi.fn(),
  revertRateCardVersionAction: vi.fn(),
  createRateCardAction,
  archiveRateCardAction,
  unarchiveRateCardAction,
}));

const { RateCardsPanel } = await import("@/components/features/RateCardsPanel");

function makeRateCard(overrides: Partial<Parameters<typeof RateCardsPanel>[0]["rateCards"][0]> = {}) {
  return {
    id: "rc_1",
    name: "2025 Rates",
    currency: "GBP",
    archivedAt: null,
    liveProjectCount: 0,
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
    ...overrides,
  };
}

const rateCards = [
  makeRateCard(),
  makeRateCard({
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
  }),
];

beforeEach(() => {
  createRateCardAction.mockReset();
  archiveRateCardAction.mockReset();
  unarchiveRateCardAction.mockReset();
});

// Creating a brand-new named Rate Card is now available both here and on
// the Client detail page (ClientRateCardsSummary) — not an either/or. See
// CreateRateCardForm.test.tsx for the create form's own detailed behavior;
// these tests only confirm RateCardsPanel renders/wires it correctly.
describe("RateCardsPanel", () => {
  it("shows a 'no rate cards' message AND the Add control for a client with none (managing user)", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={[]} canManage={true} />);

    expect(screen.getByText("No rate cards on file yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add rate card" })).toBeInTheDocument();
  });

  it("shows the Add control alongside existing cards for a client with several (managing user)", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

    expect(screen.getByText("2025 Rates (GBP)")).toBeInTheDocument();
    expect(screen.getByText("2026 Standard Rates (USD)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add rate card" })).toBeInTheDocument();
  });

  it("hides the Add control (and all Upload/Revert/Archive controls) for a non-managing (Delivery) user", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.queryByRole("button", { name: "Add rate card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("omits the '(currency)' suffix entirely for a rate card with no currency set — never renders '(null)' or '(undefined)'", () => {
    render(
      <RateCardsPanel
        clientId="client_1"
        rateCards={[makeRateCard({ currency: null })]}
        canManage={false}
      />
    );

    expect(screen.getByText("2025 Rates")).toBeInTheDocument();
    expect(screen.queryByText(/2025 Rates \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("renders one VersionHistory panel per named rate card, each showing its name/currency and current version", () => {
    render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={false} />);

    expect(screen.getByText("rates-2025.pdf")).toBeInTheDocument();
    expect(screen.getByText("rates-2026-final.pdf")).toBeInTheDocument();
    // The disabled draft version is collapsed behind its own toggle, not shown by default.
    expect(screen.getByText(/rates-2026-draft\.pdf/)).not.toBeVisible();
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

  describe("archive toggle", () => {
    it("shows an 'Archive' button (not 'Unarchive') for a non-archived Rate Card, with no 'Archived' badge", () => {
      render(<RateCardsPanel clientId="client_1" rateCards={rateCards} canManage={true} />);

      expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Unarchive" })).not.toBeInTheDocument();
      expect(screen.queryByText("Archived")).not.toBeInTheDocument();
    });

    it("shows an 'Archived' badge and an 'Unarchive' button for an archived Rate Card — it stays fully visible, not hidden", () => {
      const archived = [makeRateCard({ archivedAt: new Date("2026-01-01") })];
      render(<RateCardsPanel clientId="client_1" rateCards={archived} canManage={true} />);

      expect(screen.getByText("Archived")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unarchive" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
      expect(screen.getByText("2025 Rates (GBP)")).toBeInTheDocument();
      expect(screen.getByText("rates-2025.pdf")).toBeInTheDocument();
    });

    describe("confirmation for a card with live project references", () => {
      let confirmSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        confirmSpy = vi.spyOn(window, "confirm");
      });

      afterEach(() => {
        confirmSpy.mockRestore();
      });

      it("skips the confirmation entirely when nothing references the card (liveProjectCount 0)", async () => {
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(
          <RateCardsPanel
            clientId="client_1"
            rateCards={[makeRateCard({ liveProjectCount: 0 })]}
            canManage={true}
          />
        );

        await user.click(screen.getByRole("button", { name: "Archive" }));

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(archiveRateCardAction).toHaveBeenCalledWith("client_1", "rc_1", undefined, expect.anything());
      });

      it("asks for confirmation naming the count before archiving a card referenced by live projects, and proceeds if confirmed", async () => {
        confirmSpy.mockReturnValue(true);
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(
          <RateCardsPanel
            clientId="client_1"
            rateCards={[makeRateCard({ liveProjectCount: 3 })]}
            canManage={true}
          />
        );

        await user.click(screen.getByRole("button", { name: "Archive" }));

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("3 projects"));
        expect(archiveRateCardAction).toHaveBeenCalledWith("client_1", "rc_1", undefined, expect.anything());
      });

      it("names a single project in the singular, not '1 projects'", async () => {
        confirmSpy.mockReturnValue(true);
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(
          <RateCardsPanel
            clientId="client_1"
            rateCards={[makeRateCard({ liveProjectCount: 1 })]}
            canManage={true}
          />
        );

        await user.click(screen.getByRole("button", { name: "Archive" }));

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("1 project"));
        expect(confirmSpy).not.toHaveBeenCalledWith(expect.stringContaining("1 projects"));
      });

      it("does NOT archive if the confirmation is declined", async () => {
        confirmSpy.mockReturnValue(false);
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(
          <RateCardsPanel
            clientId="client_1"
            rateCards={[makeRateCard({ liveProjectCount: 2 })]}
            canManage={true}
          />
        );

        await user.click(screen.getByRole("button", { name: "Archive" }));

        expect(confirmSpy).toHaveBeenCalled();
        expect(archiveRateCardAction).not.toHaveBeenCalled();
      });

      it("never asks for confirmation when unarchiving, regardless of live project count", async () => {
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(
          <RateCardsPanel
            clientId="client_1"
            rateCards={[makeRateCard({ archivedAt: new Date("2026-01-01"), liveProjectCount: 5 })]}
            canManage={true}
          />
        );

        await user.click(screen.getByRole("button", { name: "Unarchive" }));

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(unarchiveRateCardAction).toHaveBeenCalledWith("client_1", "rc_1", undefined, expect.anything());
      });
    });
  });
});
