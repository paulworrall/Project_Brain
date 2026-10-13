import ExcelJS from "exceljs";
import type { Capability } from "@/generated/prisma/enums";
import { MAP_CAPABILITIES } from "@/lib/mapCapabilities";
import {
  RATE_CARD_COLUMNS,
  RATE_CARD_ERRORS,
  RATE_CARD_EXAMPLE_NOTE,
  RATE_CARD_MAX_ROWS,
  RATE_CARD_SHEET_NAME,
  validateRateCardFileMeta,
  type RateCardColumnKey,
} from "@/lib/rateCardTemplate";

export type RateCardUnit = "Hour" | "Day";

/** One validated rate line. Dates are ISO yyyy-mm-dd strings and the rate is a decimal string, never a float. */
export interface RateCardLine {
  sourceRow: number;
  role: string;
  grade: string | null;
  currency: string;
  rate: string;
  unit: RateCardUnit;
  effectiveFrom: string;
  effectiveTo: string | null;
  capability: Capability | null;
  notes: string | null;
}

export interface ParsedRateCard {
  lines: RateCardLine[];
  /** Earliest line Effective From. */
  effectiveFrom: string;
  /** Latest line Effective To, only when every line has one. */
  effectiveTo: string | null;
  /** CSV rendering of the lines, stored in RateCardVersion.extractedText for existing text consumers. */
  extractedText: string;
}

export type RateCardParseResult =
  | ({ ok: true } & ParsedRateCard)
  | { ok: false; errors: string[] };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const CURRENCY_ALIASES: Record<string, string> = {
  EURO: "EUR",
  EUROS: "EUR",
  POUND: "GBP",
  POUNDS: "GBP",
  STERLING: "GBP",
  UKP: "GBP",
  DOLLAR: "USD",
  DOLLARS: "USD",
  KRONE: "DKK",
  KRONER: "DKK",
};

let validCurrencies: Set<string> | null = null;
function isValidCurrency(code: string): boolean {
  validCurrencies ??= new Set(Intl.supportedValuesOf("currency"));
  return validCurrencies.has(code);
}

const HEADER_ALIASES: Record<string, RateCardColumnKey> = {
  role: "role",
  currency: "currency",
  rate: "rate",
  unit: "unit",
  "effective from": "effectiveFrom",
  "grade/level": "grade",
  grade: "grade",
  level: "grade",
  capability: "capability",
  "effective to": "effectiveTo",
  notes: "notes",
};

function normalizeHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

const CAPABILITY_LOOKUP = new Map<string, Capability>(
  MAP_CAPABILITIES.flatMap((c) => [
    [normalizeKey(c.id), c.id] as const,
    [normalizeKey(c.label), c.id] as const,
  ])
);

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) {
      const result = value.result;
      if (result instanceof Date) return result.toISOString();
      return result === null || result === undefined ? "" : String(result);
    }
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return String(value.error);
  }
  return String(value);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Excel date cells, ISO yyyy-mm-dd, or UK-style d/m/yyyy. Returns yyyy-mm-dd or null. */
function parseDateCell(cell: ExcelJS.Cell | undefined): string | null {
  const raw = cell?.value;
  const value = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const text = cellText(cell).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso && isRealDate(+iso[1], +iso[2], +iso[3])) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (uk && isRealDate(+uk[3], +uk[2], +uk[1])) return `${uk[3]}-${pad(+uk[2])}-${pad(+uk[1])}`;
  return null;
}

type RateResult = { ok: true; rate: string } | { ok: false; reason: string };

/** Keeps the digits exactly as written — the value is never routed through arithmetic. */
function parseRateCell(cell: ExcelJS.Cell | undefined): RateResult {
  const raw = cell?.value;
  const value = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
  const text = (typeof value === "number" ? String(value) : cellText(cell)).trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, reason: `'${cellText(cell).trim()}' isn't a valid rate, use a positive number such as 125.50.` };
  }
  const [whole, fraction = ""] = text.split(".");
  if (/^0*$/.test(whole) && /^0*$/.test(fraction)) {
    return { ok: false, reason: `'${text}' isn't a valid rate, it must be greater than zero.` };
  }
  if (fraction.length > 4) {
    return { ok: false, reason: `'${text}' has more than 4 decimal places.` };
  }
  if (whole.replace(/^0+(?=\d)/, "").length > 10) {
    return { ok: false, reason: `'${text}' is too large to be a rate.` };
  }
  return { ok: true, rate: fraction ? `${whole.replace(/^0+(?=\d)/, "")}.${fraction}` : whole.replace(/^0+(?=\d)/, "") };
}

function parseUnit(text: string): RateCardUnit | null {
  const key = text.trim().toLowerCase();
  if (["hour", "hours", "hr", "hrs", "hourly"].includes(key)) return "Hour";
  if (["day", "days", "daily"].includes(key)) return "Day";
  return null;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildExtractedText(lines: RateCardLine[]): string {
  const header = RATE_CARD_COLUMNS.map((c) => c.header).join(",");
  const rows = lines.map((l) =>
    [
      l.role,
      l.currency,
      l.rate,
      l.unit,
      l.effectiveFrom,
      l.grade ?? "",
      l.capability ?? "",
      l.effectiveTo ?? "",
      l.notes ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function fail(...errors: string[]): { ok: false; errors: string[] } {
  return { ok: false, errors };
}

/**
 * Parses a rate card .xlsx (see src/lib/rateCardTemplate.ts for the template)
 * into validated rate lines. Validates every row and reports all errors in one
 * pass, each with its row number; if any row is invalid nothing is returned
 * (all-or-nothing). Never throws.
 */
export async function parseRateCardWorkbook(
  file: { name: string; size: number; type: string },
  buffer: Buffer
): Promise<RateCardParseResult> {
  const metaError = validateRateCardFileMeta(file);
  if (metaError) return fail(metaError);
  if (!ZIP_MAGIC.every((byte, i) => buffer[i] === byte)) return fail(RATE_CARD_ERRORS.unreadable);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (error) {
    console.error(`parseRateCardWorkbook: failed to read "${file.name}"`, error);
    return fail(RATE_CARD_ERRORS.unreadable);
  }

  const sheets = workbook.worksheets;
  const named = sheets.find((s) => s.name.trim().toLowerCase() === RATE_CARD_SHEET_NAME.toLowerCase());
  const sheet = named ?? (sheets.length === 1 ? sheets[0] : undefined);
  if (!sheet) {
    return fail(
      sheets.length === 0
        ? RATE_CARD_ERRORS.unreadable
        : `No sheet named "${RATE_CARD_SHEET_NAME}" was found, and the workbook has ${sheets.length} sheets. Rename the rate card sheet to "${RATE_CARD_SHEET_NAME}".`
    );
  }

  // Header row: the first row with any content.
  let headerRowNumber = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRowNumber === 0 && row.values && (row.values as unknown[]).some((v) => v != null && v !== "")) {
      headerRowNumber = rowNumber;
    }
  });
  if (headerRowNumber === 0) return fail(RATE_CARD_ERRORS.noRows);

  const columnIndex = new Map<RateCardColumnKey, number>();
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_ALIASES[normalizeHeader(cellText(cell))];
    if (key && !columnIndex.has(key)) columnIndex.set(key, colNumber);
  });

  const missing = RATE_CARD_COLUMNS.filter((c) => c.required && !columnIndex.has(c.key)).map((c) => c.header);
  if (missing.length > 0) {
    return fail(
      `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headers.`
    );
  }

  const errors: string[] = [];
  const lines: RateCardLine[] = [];
  let dataRowCount = 0;

  const get = (row: ExcelJS.Row, key: RateCardColumnKey) => {
    const index = columnIndex.get(key);
    return index ? row.getCell(index) : undefined;
  };

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const texts = RATE_CARD_COLUMNS.map((c) => cellText(get(row, c.key)).trim());
    if (texts.every((t) => t === "")) continue; // fully blank rows are ignored

    dataRowCount++;
    if (dataRowCount > RATE_CARD_MAX_ROWS) return fail(RATE_CARD_ERRORS.tooManyRows);

    const rowErrors: string[] = [];
    const role = cellText(get(row, "role")).trim();
    if (!role) rowErrors.push("Role is required.");

    const currencyText = cellText(get(row, "currency")).trim();
    const currencyUpper = currencyText.toUpperCase();
    let currency = "";
    if (!currencyText) {
      rowErrors.push("Currency is required. Use a 3-letter code such as GBP, EUR, USD or DKK.");
    } else if (/^[A-Z]{3}$/.test(currencyUpper) && isValidCurrency(currencyUpper)) {
      currency = currencyUpper;
    } else {
      const suggestion = CURRENCY_ALIASES[currencyUpper];
      rowErrors.push(
        `'${currencyText}' isn't a valid currency code${suggestion ? `, use ${suggestion}` : ", use a 3-letter ISO code such as GBP, EUR, USD or DKK"}.`
      );
    }

    const rateResult = parseRateCell(get(row, "rate"));
    if (!rateResult.ok) {
      const rateText = cellText(get(row, "rate")).trim();
      rowErrors.push(rateText === "" ? "Rate is required." : rateResult.reason);
    }

    const unitText = cellText(get(row, "unit")).trim();
    const unit = parseUnit(unitText);
    if (!unitText) rowErrors.push("Unit is required. Use Hour or Day.");
    else if (!unit) rowErrors.push(`'${unitText}' isn't a valid unit, use Hour or Day.`);

    const fromCell = get(row, "effectiveFrom");
    const fromText = cellText(fromCell).trim();
    const effectiveFrom = parseDateCell(fromCell);
    if (!fromText) rowErrors.push("Effective From is required.");
    else if (!effectiveFrom) {
      rowErrors.push(`'Effective From' value '${fromText}' isn't a valid date. Use a date such as 2026-01-31.`);
    }

    const toCell = get(row, "effectiveTo");
    const toText = cellText(toCell).trim();
    const effectiveTo = toText ? parseDateCell(toCell) : null;
    if (toText && !effectiveTo) {
      rowErrors.push(`'Effective To' value '${toText}' isn't a valid date. Use a date such as 2026-12-31.`);
    } else if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      rowErrors.push("Effective To is before Effective From.");
    }

    const capabilityText = cellText(get(row, "capability")).trim();
    let capability: Capability | null = null;
    if (capabilityText) {
      capability = CAPABILITY_LOOKUP.get(normalizeKey(capabilityText)) ?? null;
      if (!capability) {
        rowErrors.push(`'${capabilityText}' isn't one of the MAP capabilities. Pick one from the dropdown in the template.`);
      }
    }

    if (cellText(get(row, "notes")).trim() === RATE_CARD_EXAMPLE_NOTE) {
      rowErrors.push("This is the example row from the template. Delete it or replace it with a real rate.");
    }

    if (rowErrors.length > 0) {
      for (const reason of rowErrors) errors.push(`Row ${rowNumber}: ${reason}`);
      continue;
    }

    lines.push({
      sourceRow: rowNumber,
      role,
      grade: cellText(get(row, "grade")).trim() || null,
      currency,
      rate: (rateResult as { ok: true; rate: string }).rate,
      unit: unit as RateCardUnit,
      effectiveFrom: effectiveFrom as string,
      effectiveTo,
      capability,
      notes: cellText(get(row, "notes")).trim() || null,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  if (lines.length === 0) return fail(RATE_CARD_ERRORS.noRows);

  const effectiveFrom = lines.map((l) => l.effectiveFrom).sort()[0];
  const allHaveTo = lines.every((l) => l.effectiveTo);
  const effectiveTo = allHaveTo ? lines.map((l) => l.effectiveTo as string).sort().at(-1)! : null;

  return { ok: true, lines, effectiveFrom, effectiveTo, extractedText: buildExtractedText(lines) };
}
