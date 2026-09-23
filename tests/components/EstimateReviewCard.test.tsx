// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EstimateDocumentContent } from "@/types/estimates";

vi.mock("@/app/(dashboard)/projects/[projectId]/estimates/actions", () => ({
  saveEstimateVersionAction: vi.fn(),
  updateRoleResolutionQuantityAction: vi.fn(),
}));

const { EstimateReviewCard } = await import("@/components/features/EstimateReviewCard");

// The Fizzy Europe Rate Card v1 "First draft" estimate, correctly priced.
const lines = [
  { role: "Account Director", quantity: 1.5, rate: 220, hours: 11.25, fee: 2475 },
  { role: "Project Manager", quantity: 8, rate: 150, hours: 60, fee: 9000 },
  { role: "Technical Lead", quantity: 6, rate: 240, hours: 45, fee: 10800 },
  { role: "Developer", quantity: 12, rate: 200, hours: 90, fee: 18000 },
  { role: "Data Analyst", quantity: 4, rate: 150, hours: 30, fee: 4500 },
  { role: "Developer", quantity: 3, rate: 200, hours: 22.5, fee: 4500 },
];

const content: EstimateDocumentContent = {
  overview: {
    clientName: "Fizzy",
    projectName: "Fizzy Europe Relaunch",
    projectCode: null,
    generatedDate: "23 Sept 2026",
    rateCardName: "Fizzy Europe Rate Card",
    rateCardVersionNumber: 1,
  },
  capabilitySections: [
    {
      capability: "CLIENT_ENGAGEMENT_AND_DELIVERY",
      lineItems: lines.map((line, i) => ({
        role: line.role,
        level: null,
        rateType: "HOURLY" as const,
        rate: line.rate,
        quantity: line.quantity,
        unit: "DAYS",
        hours: line.hours,
        feeSubtotal: line.fee,
        roleResolutionId: `role_${i}`,
        rateCardLineItemId: `line_${i}`,
      })),
      subtotal: 49275,
    },
  ],
  currency: "USD",
  totalValue: 49275,
  hoursPerDay: 7.5,
  daysPerWeek: 5,
};

describe("EstimateReviewCard", () => {
  it("shows each line's original quantity and unit plus converted hours, and fees priced from hours", () => {
    render(<EstimateReviewCard projectId="p1" estimateId="e1" content={content} />);

    expect(screen.getByText("1.5 days (11.25 hrs)")).toBeInTheDocument();
    expect(screen.getByText("8 days (60 hrs)")).toBeInTheDocument();
    expect(screen.getByText("2,475.00")).toBeInTheDocument();
    expect(screen.getByText("Total: 49,275.00 USD")).toBeInTheDocument();
    expect(screen.getByText(/7\.5 hrs\/day and 5 days\/week/)).toBeInTheDocument();
  });

  it("offers a unit selector per line, preset to the line's unit", () => {
    render(<EstimateReviewCard projectId="p1" estimateId="e1" content={content} />);

    const select = screen.getByLabelText("Unit for Account Director") as HTMLSelectElement;
    expect(select.value).toBe("DAYS");
    expect([...select.options].map((o) => o.value)).toEqual(["HOURS", "DAYS", "WEEKS"]);
  });
});
