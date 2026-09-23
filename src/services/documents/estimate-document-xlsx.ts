import ExcelJS from "exceljs";
import type { EstimateDocumentContent } from "@/types/estimates";
import { capabilityLabel } from "@/lib/mapCapabilities";
import { conversionBasisNote, formatQuantityWithHours } from "@/lib/estimateUnits";

/**
 * Renders an EstimateDocumentContent into a real .xlsx — mirrors
 * estimate-document-docx.ts's structure exactly (overview block, one
 * line-item table per capability with a running total that carries across
 * sections, bold subtotal/total rows), just as a workbook instead of a
 * Word document. Pure rendering, no AI call and no arithmetic — every
 * number here was already computed deterministically by
 * estimate-pricing.ts before this is called.
 */
export async function renderEstimateDocumentXlsx(
  content: EstimateDocumentContent
): Promise<Buffer> {
  const { overview, capabilitySections, currency, totalValue } = content;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Estimate");
  sheet.columns = [
    { width: 28 },
    { width: 16 },
    { width: 24 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
  ];

  sheet.addRow(["Estimate"]).font = { bold: true, size: 16 };
  sheet.addRow([]);
  sheet.addRow(["Client", overview.clientName]);
  sheet.addRow(["Project", overview.projectName]);
  sheet.addRow(["Project code", overview.projectCode ?? "Not yet set"]);
  sheet.addRow(["Generated", overview.generatedDate]);
  sheet.addRow([
    "Rate card",
    `${overview.rateCardName} (version ${overview.rateCardVersionNumber})`,
  ]);
  sheet.addRow([]);

  let runningTotal = 0;
  for (const section of capabilitySections) {
    const headingRow = sheet.addRow([capabilityLabel(section.capability)]);
    headingRow.font = { bold: true, size: 13 };

    const headerRow = sheet.addRow(["Role", "Level", "Quantity", "Rate", "Fee", "Running Total"]);
    headerRow.font = { bold: true };

    for (const line of section.lineItems) {
      runningTotal += line.feeSubtotal;
      const rateLabel = `${line.rate.toFixed(2)} / ${line.rateType.toLowerCase()}`;
      sheet.addRow([
        line.role,
        line.level ?? "—",
        formatQuantityWithHours(line.quantity, line.unit, line.hours),
        rateLabel,
        line.feeSubtotal.toFixed(2),
        runningTotal.toFixed(2),
      ]);
    }

    const subtotalRow = sheet.addRow([
      `${capabilityLabel(section.capability)} subtotal: ${section.subtotal.toFixed(2)} ${currency}`,
    ]);
    subtotalRow.font = { bold: true };
    sheet.addRow([]);
  }

  const totalRow = sheet.addRow([`Total estimate value: ${totalValue.toFixed(2)} ${currency}`]);
  totalRow.font = { bold: true, size: 13 };
  const basis = conversionBasisNote(content);
  if (basis) {
    sheet.addRow([basis]).font = { italic: true };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
