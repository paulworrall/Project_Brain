import ExcelJS from "exceljs";
import { MAP_CAPABILITIES } from "@/lib/mapCapabilities";
import {
  RATE_CARD_COLUMNS,
  RATE_CARD_EXAMPLE_NOTE,
  RATE_CARD_INSTRUCTIONS_SHEET_NAME,
  RATE_CARD_MAX_ROWS,
  RATE_CARD_SHEET_NAME,
  RATE_CARD_UNITS,
} from "@/lib/rateCardTemplate";

const LISTS_SHEET_NAME = "Lists";
const COMMON_CURRENCIES = ["GBP", "EUR", "USD", "DKK", "SEK", "NOK", "CHF", "AUD", "CAD", "JPY", "SGD", "AED"];
const VALIDATED_ROWS = 500;

const INSTRUCTIONS = [
  "How to fill in the Rate Card sheet",
  "",
  "1. Keep the sheet named 'Rate Card' and the header row as it is. Header names are matched ignoring capitals and extra spaces.",
  "2. One row per role, grade and currency. A rate card can hold rates in several currencies; there is no currency conversion.",
  "3. Required columns: Role, Currency, Rate, Unit, Effective From.",
  "   - Currency: a 3-letter ISO 4217 code such as GBP, EUR, USD or DKK.",
  "   - Rate: a positive number with up to 4 decimal places, e.g. 650 or 62.125. No currency symbols.",
  "   - Unit: Hour or Day.",
  "   - Effective From: a date, e.g. 2026-01-31 (day/month/year such as 31/01/2026 also works).",
  "4. Optional columns: Grade/Level, Capability (pick from the dropdown), Effective To, Notes.",
  "5. Delete the example row (row 2) before uploading. Blank rows are ignored.",
  "6. If any row has a problem the whole upload is rejected, and every problem is listed with its row number so you can fix them in one go.",
];

/** Builds the downloadable rate card template: headers, one example row, dropdown validations and an instructions sheet. */
export async function buildRateCardTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(RATE_CARD_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = RATE_CARD_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.key === "notes" ? 40 : c.key === "capability" ? 34 : c.key === "role" ? 28 : 16,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  RATE_CARD_COLUMNS.forEach((c, i) => {
    if (c.required) {
      header.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9D9" } };
    }
  });

  // Capability options live on a hidden sheet: an inline dropdown list is
  // capped at 255 characters, which the 12 capability names exceed.
  const lists = workbook.addWorksheet(LISTS_SHEET_NAME, { state: "hidden" });
  lists.getCell("A1").value = "Capability";
  MAP_CAPABILITIES.forEach((c, i) => {
    lists.getCell(`A${i + 2}`).value = c.label;
  });

  sheet.addRow({
    role: "Senior Designer",
    currency: "GBP",
    rate: 650,
    unit: "Day",
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    grade: "Senior",
    capability: MAP_CAPABILITIES.find((c) => c.id === "EXPERIENCE_DESIGN")?.label,
    effectiveTo: null,
    notes: RATE_CARD_EXAMPLE_NOTE,
  });

  const col = (key: (typeof RATE_CARD_COLUMNS)[number]["key"]) =>
    String.fromCharCode(65 + RATE_CARD_COLUMNS.findIndex((c) => c.key === key));

  for (let row = 2; row <= VALIDATED_ROWS; row++) {
    sheet.getCell(`${col("currency")}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${COMMON_CURRENCIES.join(",")}"`],
      // Warning, not stop: any valid ISO 4217 code may still be typed in.
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Currency",
      error: "Use a 3-letter ISO 4217 code such as GBP, EUR, USD or DKK.",
    };
    sheet.getCell(`${col("unit")}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${RATE_CARD_UNITS.join(",")}"`],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Unit",
      error: "Choose Hour or Day.",
    };
    sheet.getCell(`${col("capability")}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`${LISTS_SHEET_NAME}!$A$2:$A$${MAP_CAPABILITIES.length + 1}`],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Capability",
      error: "Pick one of the MAP capabilities from the list.",
    };
  }
  for (const key of ["effectiveFrom", "effectiveTo"] as const) {
    sheet.getColumn(col(key).charCodeAt(0) - 64).numFmt = "yyyy-mm-dd";
  }
  sheet.getColumn(col("rate").charCodeAt(0) - 64).numFmt = "#,##0.00##";

  const instructions = workbook.addWorksheet(RATE_CARD_INSTRUCTIONS_SHEET_NAME);
  instructions.getColumn(1).width = 110;
  INSTRUCTIONS.forEach((text, i) => {
    const cell = instructions.getCell(`A${i + 1}`);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
  instructions.getCell(`A${INSTRUCTIONS.length + 2}`).value = `Up to ${RATE_CARD_MAX_ROWS} rate lines per upload.`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
