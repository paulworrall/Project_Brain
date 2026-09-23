import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { EstimateDocumentContent } from "@/types/estimates";
import { capabilityLabel } from "@/lib/mapCapabilities";
import { conversionBasisNote, formatQuantityWithHours } from "@/lib/estimateUnits";

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ text })] });
}

/**
 * One line-item table per capability, with a running/cumulative total
 * column that carries across capability sections (not just within one) —
 * per the "one line-item table per capability... and a running/cumulative
 * total" requirement.
 */
function lineItemsTable(
  lineItems: EstimateDocumentContent["capabilitySections"][number]["lineItems"],
  runningTotalStart: number
): { table: Table; runningTotal: number } {
  let running = runningTotalStart;
  const rows = [
    new TableRow({
      children: [
        headerCell("Role"),
        headerCell("Level"),
        headerCell("Quantity"),
        headerCell("Rate"),
        headerCell("Fee"),
        headerCell("Running Total"),
      ],
    }),
    ...lineItems.map((line) => {
      running += line.feeSubtotal;
      const rateLabel = `${line.rate.toFixed(2)} / ${line.rateType.toLowerCase()}`;
      return new TableRow({
        children: [
          cell(line.role),
          cell(line.level ?? "—"),
          cell(formatQuantityWithHours(line.quantity, line.unit, line.hours)),
          cell(rateLabel),
          cell(line.feeSubtotal.toFixed(2)),
          cell(running.toFixed(2)),
        ],
      });
    }),
  ];
  return {
    table: new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    runningTotal: running,
  };
}

/**
 * Renders an EstimateDocumentContent into a real .docx — an overview block
 * followed by one line-item table per capability. Pure rendering, no AI
 * call and no arithmetic: every number here (rate/fee/subtotal/total) was
 * already computed deterministically by estimate-pricing.ts before this is
 * called (see saveEstimateVersionAction).
 */
export async function renderEstimateDocumentDocx(
  content: EstimateDocumentContent
): Promise<Buffer> {
  const { overview, capabilitySections, currency, totalValue } = content;

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "Estimate", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "Overview", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Client: ${overview.clientName}` }),
    new Paragraph({ text: `Project: ${overview.projectName}` }),
    new Paragraph({ text: `Project code: ${overview.projectCode ?? "Not yet set"}` }),
    new Paragraph({ text: `Generated: ${overview.generatedDate}` }),
    new Paragraph({
      text: `Rate card: ${overview.rateCardName} (version ${overview.rateCardVersionNumber})`,
    }),
  ];

  let runningTotal = 0;
  for (const section of capabilitySections) {
    children.push(
      new Paragraph({ text: capabilityLabel(section.capability), heading: HeadingLevel.HEADING_1 })
    );
    const { table, runningTotal: updatedRunningTotal } = lineItemsTable(
      section.lineItems,
      runningTotal
    );
    runningTotal = updatedRunningTotal;
    children.push(table);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${capabilityLabel(section.capability)} subtotal: ${section.subtotal.toFixed(2)} ${currency}`,
            bold: true,
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: `Total estimate value: ${totalValue.toFixed(2)} ${currency}` }),
      ],
    })
  );
  const basis = conversionBasisNote(content);
  if (basis) {
    children.push(new Paragraph({ children: [new TextRun({ text: basis, italics: true })] }));
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
