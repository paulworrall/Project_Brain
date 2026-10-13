import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  DEFAULT_HEADERS,
  XLSX_MIME,
  rateCardWorkbookBuffer,
  validRow,
  type RateCardRow,
} from "../helpers/rateCardWorkbook";
import { RATE_CARD_ERRORS, formatCurrencySummary, validateRateCardFileMeta } from "@/lib/rateCardTemplate";

vi.spyOn(console, "error").mockImplementation(() => {});

const { parseRateCardWorkbook } = await import("@/services/parsing/rate-card-xlsx");

async function parse(rows: RateCardRow[], options?: Parameters<typeof rateCardWorkbookBuffer>[1], name = "rates.xlsx") {
  const buffer = await rateCardWorkbookBuffer(rows, options);
  return parseRateCardWorkbook({ name, size: buffer.length, type: XLSX_MIME }, buffer);
}

async function errorsFor(rows: RateCardRow[], options?: Parameters<typeof rateCardWorkbookBuffer>[1]) {
  const result = await parse(rows, options);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

describe("parseRateCardWorkbook — valid uploads", () => {
  it("parses a single-currency card into structured lines", async () => {
    const result = await parse([
      validRow(),
      validRow({ Role: "Developer", Rate: 90.5, Unit: "Hour", "Grade/Level": "Mid", Notes: "Core team" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      sourceRow: 2,
      role: "Senior Designer",
      currency: "GBP",
      rate: "650",
      unit: "Day",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      capability: null,
    });
    expect(result.lines[1]).toMatchObject({ unit: "Hour", grade: "Mid", notes: "Core team", rate: "90.5" });
    expect(formatCurrencySummary(result.lines)).toBe("2 rates: 2 GBP");
    expect(result.effectiveFrom).toBe("2026-01-01");
  });

  it("parses a multi-currency card and summarises the currencies", async () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => validRow({ Role: `UK ${i}`, Currency: "GBP" })),
      ...Array.from({ length: 2 }, (_, i) => validRow({ Role: `EU ${i}`, Currency: "EUR" })),
      validRow({ Role: "DK", Currency: "dkk" }),
    ];
    const result = await parse(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatCurrencySummary(result.lines)).toBe("6 rates: 3 GBP, 2 EUR, 1 DKK");
    expect(new Set(result.lines.map((l) => l.currency))).toEqual(new Set(["GBP", "EUR", "DKK"]));
  });

  it("matches headers ignoring case and surrounding whitespace, in any column order", async () => {
    const headers = ["  ROLE ", "rate", "currency", " unit", "effective from  ", "grade/level"];
    const result = await parse([validRow({ "Grade/Level": "Lead" })], { headers });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]).toMatchObject({ role: "Senior Designer", currency: "GBP", grade: "Lead" });
  });

  it("ignores fully blank rows but keeps the real row numbers", async () => {
    const result = await parse([validRow(), {}, validRow({ Role: "After the gap" })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => l.sourceRow)).toEqual([2, 4]);
  });

  it("uses the only sheet when none is named 'Rate Card', and the named one when there are several", async () => {
    expect((await parse([validRow()], { sheetName: "Prices" })).ok).toBe(true);
    expect((await parse([validRow()], { extraSheets: ["Instructions"] })).ok).toBe(true);
  });

  it("resolves capability labels and enum names, and accepts ISO or UK-style date text", async () => {
    const result = await parse([
      validRow({ Capability: "Experience Design", "Effective From": "2026-03-01", "Effective To": "31/12/2026" }),
      validRow({ Capability: "TECH_AND_DATA", "Effective From": "1/4/2026" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]).toMatchObject({ capability: "EXPERIENCE_DESIGN", effectiveFrom: "2026-03-01", effectiveTo: "2026-12-31" });
    expect(result.lines[1]).toMatchObject({ capability: "TECH_AND_DATA", effectiveFrom: "2026-04-01" });
  });

  it("sets the version's effective dates from the lines: earliest From, and a To only when every row has one", async () => {
    const withTo = await parse([
      validRow({ "Effective From": new Date(Date.UTC(2026, 5, 1)), "Effective To": new Date(Date.UTC(2026, 11, 31)) }),
      validRow({ "Effective From": new Date(Date.UTC(2026, 0, 1)), "Effective To": new Date(Date.UTC(2027, 5, 30)) }),
    ]);
    expect(withTo.ok && [withTo.effectiveFrom, withTo.effectiveTo]).toEqual(["2026-01-01", "2027-06-30"]);

    const mixed = await parse([validRow({ "Effective To": new Date(Date.UTC(2026, 11, 31)) }), validRow()]);
    expect(mixed.ok && mixed.effectiveTo).toBeNull();
  });
});

describe("parseRateCardWorkbook — decimal precision", () => {
  it("keeps rates exactly as written, as decimal strings (never floats)", async () => {
    const result = await parse([
      validRow({ Rate: 19.99 }),
      validRow({ Rate: 62.125 }),
      validRow({ Rate: 1234.5678 }),
      validRow({ Rate: "1,250.50" }),
      validRow({ Rate: 0.1 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => l.rate)).toEqual(["19.99", "62.125", "1234.5678", "1250.50", "0.1"]);
  });

  it("rejects more than 4 decimal places rather than silently rounding", async () => {
    expect(await errorsFor([validRow({ Rate: 10.12345 })])).toEqual([
      "Row 2: '10.12345' has more than 4 decimal places.",
    ]);
  });
});

describe("parseRateCardWorkbook — row-level errors, all reported in one pass", () => {
  it("reports a missing currency", async () => {
    expect(await errorsFor([validRow({ Currency: null })])).toEqual([
      "Row 2: Currency is required. Use a 3-letter code such as GBP, EUR, USD or DKK.",
    ]);
  });

  it("reports an invalid currency code and suggests the right one for common mistakes", async () => {
    const errors = await errorsFor([validRow(), validRow({ Currency: "EURO" }), validRow({ Currency: "XYZ" }), validRow({ Currency: "£" })]);
    expect(errors).toEqual([
      "Row 3: 'EURO' isn't a valid currency code, use EUR.",
      "Row 4: 'XYZ' isn't a valid currency code, use a 3-letter ISO code such as GBP, EUR, USD or DKK.",
      "Row 5: '£' isn't a valid currency code, use a 3-letter ISO code such as GBP, EUR, USD or DKK.",
    ]);
  });

  it("reports non-numeric, negative, zero and missing rates", async () => {
    const errors = await errorsFor([
      validRow({ Rate: "abc" }),
      validRow({ Rate: -50 }),
      validRow({ Rate: 0 }),
      validRow({ Rate: null }),
      validRow({ Rate: "£650" }),
    ]);
    expect(errors).toEqual([
      "Row 2: 'abc' isn't a valid rate, use a positive number such as 125.50.",
      "Row 3: '-50' isn't a valid rate, use a positive number such as 125.50.",
      "Row 4: '0' isn't a valid rate, it must be greater than zero.",
      "Row 5: Rate is required.",
      "Row 6: '£650' isn't a valid rate, use a positive number such as 125.50.",
    ]);
  });

  it("reports bad and missing dates, and an end date before the start", async () => {
    const errors = await errorsFor([
      validRow({ "Effective From": "soon" }),
      validRow({ "Effective From": "31/02/2026" }),
      validRow({ "Effective From": null }),
      validRow({ "Effective To": "2025-01-01" }),
      validRow({ "Effective To": "never" }),
    ]);
    expect(errors).toEqual([
      "Row 2: 'Effective From' value 'soon' isn't a valid date. Use a date such as 2026-01-31.",
      "Row 3: 'Effective From' value '31/02/2026' isn't a valid date. Use a date such as 2026-01-31.",
      "Row 4: Effective From is required.",
      "Row 5: Effective To is before Effective From.",
      "Row 6: 'Effective To' value 'never' isn't a valid date. Use a date such as 2026-12-31.",
    ]);
  });

  it("reports an invalid unit, an invalid capability and a missing role", async () => {
    const errors = await errorsFor([
      validRow({ Unit: "Week" }),
      validRow({ Capability: "Basket Weaving" }),
      validRow({ Role: null }),
    ]);
    expect(errors).toEqual([
      "Row 2: 'Week' isn't a valid unit, use Hour or Day.",
      "Row 3: 'Basket Weaving' isn't one of the MAP capabilities. Pick one from the dropdown in the template.",
      "Row 4: Role is required.",
    ]);
  });

  it("collects every error across rows (and several per row) instead of stopping at the first, and rejects the whole upload", async () => {
    const result = await parse([
      validRow(),
      validRow({ Currency: "EURO", Rate: -1 }),
      validRow(),
      validRow({ Unit: "Week" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/^Row 3: 'EURO'/);
    expect(result.errors[1]).toMatch(/^Row 3: '-1'/);
    expect(result.errors[2]).toMatch(/^Row 5: 'Week'/);
    expect("lines" in result).toBe(false); // never a partial card
  });

  it("reports a missing required column by name", async () => {
    const headers = DEFAULT_HEADERS.filter((h) => h !== "Currency" && h !== "Unit");
    expect(await errorsFor([validRow()], { headers })).toEqual([
      "Missing required columns: Currency, Unit. Download the template to see the expected headers.",
    ]);
  });

  it("rejects the template's untouched example row", async () => {
    const { buildRateCardTemplate } = await import("@/services/documents/rate-card-template-xlsx");
    const buffer = await buildRateCardTemplate();
    const result = await parseRateCardWorkbook({ name: "t.xlsx", size: buffer.length, type: XLSX_MIME }, buffer);
    expect(result).toEqual({
      ok: false,
      errors: ["Row 2: This is the example row from the template. Delete it or replace it with a real rate."],
    });
  });

  it("reports no usable sheet when several sheets exist and none is named 'Rate Card'", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("One");
    workbook.addWorksheet("Two");
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseRateCardWorkbook({ name: "x.xlsx", size: buffer.length, type: "" }, buffer);
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('No sheet named "Rate Card"')] });
  });

  it("reports an empty card, and an unreadable or corrupt workbook", async () => {
    expect(await errorsFor([])).toEqual([RATE_CARD_ERRORS.noRows]);
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("garbage")]);
    expect(await parseRateCardWorkbook({ name: "c.xlsx", size: corrupt.length, type: "" }, corrupt)).toEqual({
      ok: false,
      errors: [RATE_CARD_ERRORS.unreadable],
    });
  });
});

describe("rate card file type rules", () => {
  it("accepts .xlsx with an empty or generic MIME type", () => {
    for (const type of ["", "application/octet-stream", XLSX_MIME]) {
      expect(validateRateCardFileMeta({ name: "rates.xlsx", size: 10, type })).toBeNull();
    }
  });

  it("rejects .txt with the template message", async () => {
    expect(validateRateCardFileMeta({ name: "RateCard_2026.txt", size: 10, type: "text/plain" })).toBe(
      "Rate cards must be uploaded as Excel (.xlsx). Download the template to get started."
    );
    const result = await parseRateCardWorkbook({ name: "RateCard_2026.txt", size: 4, type: "text/plain" }, Buffer.from("text"));
    expect(result).toEqual({ ok: false, errors: [RATE_CARD_ERRORS.notXlsx] });
  });

  it("rejects legacy .xls with re-save guidance", () => {
    const message = validateRateCardFileMeta({ name: "rates.xls", size: 10, type: "application/vnd.ms-excel" });
    expect(message).toBe(RATE_CARD_ERRORS.legacyXls);
    expect(message).toMatch(/\.xlsx/);
  });

  it("rejects other formats (docx, pdf, csv) and oversized files", () => {
    for (const name of ["rates.docx", "rates.pdf", "rates.csv"]) {
      expect(validateRateCardFileMeta({ name, size: 10, type: "" })).toBe(RATE_CARD_ERRORS.notXlsx);
    }
    expect(validateRateCardFileMeta({ name: "big.xlsx", size: 6 * 1024 * 1024, type: "" })).toBe(RATE_CARD_ERRORS.tooLarge);
  });
});
