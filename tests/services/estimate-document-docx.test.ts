import { describe, expect, it } from "vitest";
import { renderEstimateDocumentDocx } from "@/services/documents/estimate-document-docx";

const content = {
  overview: {
    clientName: "Coffee",
    projectName: "Loyalty App Relaunch",
    projectCode: "COF-2026-001",
    generatedDate: "22 Sept 2026",
    rateCardName: "Project Rates",
    rateCardVersionNumber: 2,
  },
  capabilitySections: [
    {
      capability: "TECH_AND_DATA" as const,
      lineItems: [
        {
          role: "Developer",
          level: "Senior",
          rateType: "DAILY" as const,
          rate: 700,
          quantity: 5,
          unit: "days",
          feeSubtotal: 3500,
          roleResolutionId: "role_1",
          rateCardLineItemId: "line_1",
        },
      ],
      subtotal: 3500,
    },
    {
      capability: "EXPERIENCE_DESIGN" as const,
      lineItems: [
        {
          role: "Designer",
          level: "Mid",
          rateType: "DAILY" as const,
          rate: 500,
          quantity: 4,
          unit: "days",
          feeSubtotal: 2000,
          roleResolutionId: "role_2",
          rateCardLineItemId: "line_2",
        },
      ],
      subtotal: 2000,
    },
  ],
  currency: "GBP",
  totalValue: 5500,
};

describe("renderEstimateDocumentDocx", () => {
  it("renders a real .docx (OOXML zip) buffer, not markdown or a PDF relabelled", async () => {
    const buffer = await renderEstimateDocumentDocx(content);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // The OOXML/zip file signature ("PK") — proves this is a real .docx
    // container, not plain text dressed up with a .docx extension.
    expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a larger document for more capability sections", async () => {
    const oneSection = await renderEstimateDocumentDocx({
      ...content,
      capabilitySections: [content.capabilitySections[0]],
    });
    const twoSections = await renderEstimateDocumentDocx(content);

    expect(twoSections.length).toBeGreaterThan(oneSection.length);
  });
});
