// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EstimateScopeSync } from "@/lib/estimateScopeSyncView";

vi.mock("@/app/(dashboard)/projects/[projectId]/estimates/actions", () => ({
  createEstimateAction: vi.fn(),
}));

const { EstimatesListPanel } = await import("@/components/features/EstimatesListPanel");

function panel(sync: EstimateScopeSync | undefined) {
  return (
    <EstimatesListPanel
      projectId="p1"
      rateCardOptions={[]}
      estimates={[
        {
          id: "e1",
          label: "Initial estimate",
          scopeSync: sync,
          versions: [
            {
              id: "ev1",
              versionNumber: 1,
              createdAt: new Date("2026-11-01T10:00:00Z"),
              totalValue: 45675,
              currency: "USD",
              description: "2 capabilities",
              needsRecalculation: false,
            },
          ],
        },
      ]}
    />
  );
}

const stale: EstimateScopeSync = {
  estimateId: "e1",
  status: "stale",
  sourceVersionNumber: 1,
  confirmedVersionNumber: 3,
  confirmedAt: new Date("2026-11-04T10:00:00Z"),
  changedSections: ["Deliverables"],
  approved: false,
};

describe("Scope changed since this estimate", () => {
  it("shows the changed sections and a Review estimate link on a draft estimate", () => {
    render(panel(stale));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Scope changed since this estimate");
    expect(notice).toHaveTextContent("Changed: Deliverables — this estimate used v1");
    expect(screen.getByRole("link", { name: "Review estimate" })).toHaveAttribute(
      "href",
      "/projects/p1/estimates/e1"
    );
  });

  it("is information only on an approved estimate, with the change-request note", () => {
    render(panel({ ...stale, approved: true }));
    expect(screen.getByRole("status")).toHaveTextContent(/Changes will need a change request/);
    expect(screen.queryByRole("link", { name: "Review estimate" })).toBeNull();
  });

  it("shows nothing when the estimate is in sync or unlinked", () => {
    const { rerender } = render(panel({ ...stale, status: "in_sync" }));
    expect(screen.queryByText("Scope changed since this estimate")).toBeNull();
    rerender(panel(undefined));
    expect(screen.queryByText("Scope changed since this estimate")).toBeNull();
  });
});
