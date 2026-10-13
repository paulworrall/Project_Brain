import ExcelJS from "exceljs";

/** One row of the rate card template, as raw cell values (strings, numbers, Dates or null). */
export type RateCardRow = Partial<{
  Role: unknown;
  Currency: unknown;
  Rate: unknown;
  Unit: unknown;
  "Effective From": unknown;
  "Grade/Level": unknown;
  Capability: unknown;
  "Effective To": unknown;
  Notes: unknown;
}>;

export const DEFAULT_HEADERS = [
  "Role",
  "Currency",
  "Rate",
  "Unit",
  "Effective From",
  "Grade/Level",
  "Capability",
  "Effective To",
  "Notes",
];

export function validRow(overrides: RateCardRow = {}): RateCardRow {
  return {
    Role: "Senior Designer",
    Currency: "GBP",
    Rate: 650,
    Unit: "Day",
    "Effective From": new Date(Date.UTC(2026, 0, 1)),
    ...overrides,
  };
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Builds a real .xlsx workbook with a header row and the given rows. */
export async function rateCardWorkbookBuffer(
  rows: RateCardRow[],
  options: { headers?: string[]; sheetName?: string; extraSheets?: string[] } = {}
): Promise<Buffer> {
  const headers = options.headers ?? DEFAULT_HEADERS;
  const workbook = new ExcelJS.Workbook();
  for (const name of options.extraSheets ?? []) workbook.addWorksheet(name);
  const sheet = workbook.addWorksheet(options.sheetName ?? "Rate Card");
  sheet.addRow(headers);
  for (const row of rows) {
    // Match by case/whitespace-insensitive header so tests can rename headers.
    sheet.addRow(
      headers.map((h) => {
        const key = Object.keys(row).find((k) => k.toLowerCase() === h.trim().toLowerCase());
        return key ? (row as Record<string, unknown>)[key] ?? null : null;
      })
    );
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function rateCardXlsxFile(
  rows: RateCardRow[] = [validRow()],
  name = "rate-card.xlsx",
  options: Parameters<typeof rateCardWorkbookBuffer>[1] = {}
): Promise<File> {
  const buffer = await rateCardWorkbookBuffer(rows, options);
  return new File([new Uint8Array(buffer)], name, { type: XLSX_MIME });
}
