import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { renderEstimateDocumentXlsx } from "@/services/documents/estimate-document-xlsx";

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

describe("renderEstimateDocumentXlsx", () => {
  it("renders a real .xlsx (OOXML zip) buffer, not a renamed csv", async () => {
    const buffer = await renderEstimateDocumentXlsx(content);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a larger workbook for more capability sections", async () => {
    const oneSection = await renderEstimateDocumentXlsx({
      ...content,
      capabilitySections: [content.capabilitySections[0]],
    });
    const twoSections = await renderEstimateDocumentXlsx(content);

    expect(twoSections.length).toBeGreaterThan(oneSection.length);
  });

  it("carries a running total across capability sections and states the correct grand total", async () => {
    const buffer = await renderEstimateDocumentXlsx(content);

    const workbook = new ExcelJS.Workbook();
    // exceljs's declared Buffer type is structurally incompatible with this
    // project's @types/node version (same at runtime, mismatched types) —
    // no safe intermediate cast satisfies it, so this escapes the checker.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Estimate")!;

    const values = sheet
      .getSheetValues()
      .flatMap((row) =>
        Array.isArray(row) ? row.filter((v) => v !== undefined && v !== null) : []
      );
    const flatText = values.map(String).join(" | ");

    expect(flatText).toContain("3500.00"); // first section's line fee / running total
    expect(flatText).toContain("5500.00"); // running total after both sections, and the grand total
    expect(flatText).toContain("Total estimate value: 5500.00 GBP");
  });

  async function sheetText(buffer: Buffer): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    return workbook
      .getWorksheet("Estimate")!
      .getSheetValues()
      .flatMap((row) =>
        Array.isArray(row) ? row.filter((v) => v !== undefined && v !== null) : []
      )
      .map(String)
      .join(" | ");
  }

  it("shows each line's original quantity and unit plus converted hours, and the conversion basis", async () => {
    const buffer = await renderEstimateDocumentXlsx({
      ...content,
      capabilitySections: [
        {
          capability: "CLIENT_ENGAGEMENT_AND_DELIVERY" as const,
          lineItems: [
            {
              role: "Account Director",
              level: null,
              rateType: "HOURLY" as const,
              rate: 220,
              quantity: 1.5,
              unit: "DAYS",
              hours: 11.25,
              feeSubtotal: 2475,
              roleResolutionId: "role_ad",
              rateCardLineItemId: "line_ad",
            },
          ],
          subtotal: 2475,
        },
      ],
      currency: "USD",
      totalValue: 2475,
      hoursPerDay: 7.5,
      daysPerWeek: 5,
    });
    const flatText = await sheetText(buffer);

    expect(flatText).toContain("Quantity");
    expect(flatText).toContain("1.5 days (11.25 hrs)");
    expect(flatText).toContain("2475.00");
    expect(flatText).toContain("7.5 hrs/day");
  });

  it("still renders legacy content saved before unit conversion (no hours, free-text unit)", async () => {
    const flatText = await sheetText(await renderEstimateDocumentXlsx(content));

    expect(flatText).toContain("5 days");
    expect(flatText).not.toContain("hrs/day");
  });
});
