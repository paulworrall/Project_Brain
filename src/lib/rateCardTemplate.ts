// Client-safe definition of the rate card .xlsx template and upload rules (FB-001).
// No exceljs/Node imports, so the upload UI and the server share one source of
// truth for the columns, the accepted file type and what users are told.

export const RATE_CARD_SHEET_NAME = "Rate Card";
export const RATE_CARD_INSTRUCTIONS_SHEET_NAME = "Instructions";

export const RATE_CARD_COLUMNS = [
  { key: "role", header: "Role", required: true },
  { key: "currency", header: "Currency", required: true },
  { key: "rate", header: "Rate", required: true },
  { key: "unit", header: "Unit", required: true },
  { key: "effectiveFrom", header: "Effective From", required: true },
  { key: "grade", header: "Grade/Level", required: false },
  { key: "capability", header: "Capability", required: false },
  { key: "effectiveTo", header: "Effective To", required: false },
  { key: "notes", header: "Notes", required: false },
] as const;

export type RateCardColumnKey = (typeof RATE_CARD_COLUMNS)[number]["key"];

export const RATE_CARD_UNITS = ["Hour", "Day"] as const;

export const RATE_CARD_ACCEPT_ATTRIBUTE = ".xlsx";
export const RATE_CARD_TEMPLATE_URL = "/api/rate-card-template";

// The whole request (file plus form fields) must stay under next.config.ts
// serverActions.bodySizeLimit (10mb).
export const RATE_CARD_MAX_BYTES = 5 * 1024 * 1024;
export const RATE_CARD_MAX_ROWS = 2000;

export const RATE_CARD_ERRORS = {
  notXlsx: "Rate cards must be uploaded as Excel (.xlsx). Download the template to get started.",
  legacyXls:
    "Older Excel (.xls) files can't be read. Open it in Excel, choose Save As → Excel Workbook (.xlsx), and upload that.",
  tooLarge: `This file is too large (max ${RATE_CARD_MAX_BYTES / 1024 / 1024} MB).`,
  unreadable:
    "We couldn't read this file as an Excel workbook. It may be corrupt or password-protected. Download the template to get started.",
  noFile: "Upload the rate card file.",
  noRows: "No rate lines were found. Add at least one row under the headers, or download the template.",
  tooManyRows: `This file has more than ${RATE_CARD_MAX_ROWS} rate lines. Split it into several rate cards.`,
} as const;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NEUTRAL_MIME = new Set([
  "",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "binary/octet-stream",
]);

export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Cheap checks that need no file contents: extension, MIME type, size.
 * Returns a user-facing message or null. A valid .xlsx is never rejected for
 * an empty/generic MIME type.
 */
export function validateRateCardFileMeta(file: { name: string; size: number; type: string }): string | null {
  const ext = getFileExtension(file.name);
  if (ext === "xls") return RATE_CARD_ERRORS.legacyXls;
  if (ext !== "xlsx") return RATE_CARD_ERRORS.notXlsx;

  const mime = file.type.trim().toLowerCase();
  if (!NEUTRAL_MIME.has(mime) && mime !== XLSX_MIME) {
    return mime === "application/vnd.ms-excel" ? RATE_CARD_ERRORS.legacyXls : RATE_CARD_ERRORS.notXlsx;
  }
  if (file.size === 0) return RATE_CARD_ERRORS.unreadable;
  if (file.size > RATE_CARD_MAX_BYTES) return RATE_CARD_ERRORS.tooLarge;
  return null;
}

/** Distinct currencies in first-seen order, e.g. ["GBP", "EUR"]. */
export function distinctCurrencies(lines: { currency: string }[]): string[] {
  return [...new Set(lines.map((l) => l.currency))];
}

/** "42 rates: 30 GBP, 12 EUR" — largest group first. */
export function formatCurrencySummary(lines: { currency: string }[]): string {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.currency, (counts.get(l.currency) ?? 0) + 1);
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const noun = lines.length === 1 ? "rate" : "rates";
  return `${lines.length} ${noun}: ${parts.map(([c, n]) => `${n} ${c}`).join(", ")}`;
}

/** Short label for where a version is shown or chosen, e.g. "GBP, EUR"; "" when no lines are recorded. */
export function formatVersionCurrencies(lines: { currency: string }[]): string {
  return [...new Set(lines.map((l) => l.currency))].sort().join(", ");
}

/** The template's sample row carries this note; a row still carrying it is rejected so it can't be saved as a real rate. */
export const RATE_CARD_EXAMPLE_NOTE = "EXAMPLE ROW: delete or replace before uploading";
