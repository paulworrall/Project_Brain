import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { RATE_CARD_COLUMNS, RATE_CARD_EXAMPLE_NOTE } from "@/lib/rateCardTemplate";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const { buildRateCardTemplate } = await import("@/services/documents/rate-card-template-xlsx");
const { GET } = await import("@/app/api/rate-card-template/route");

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

describe("buildRateCardTemplate", () => {
  it("has a 'Rate Card' sheet with every header and one example row", async () => {
    const workbook = await load(await buildRateCardTemplate());
    const sheet = workbook.getWorksheet("Rate Card")!;
    expect(sheet).toBeDefined();

    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(RATE_CARD_COLUMNS.map((c) => c.header));

    const example = sheet.getRow(2);
    expect(example.getCell(1).value).toBe("Senior Designer");
    expect(example.getCell(2).value).toBe("GBP");
    expect(example.getCell(9).value).toBe(RATE_CARD_EXAMPLE_NOTE);
    expect(sheet.getRow(3).getCell(1).value).toBeNull();
  });

  it("has dropdown validation for Currency, Unit and Capability", async () => {
    const workbook = await load(await buildRateCardTemplate());
    const sheet = workbook.getWorksheet("Rate Card")!;

    const currency = sheet.getCell("B5").dataValidation;
    expect(currency.type).toBe("list");
    expect(currency.formulae[0]).toContain("GBP,EUR,USD,DKK");

    const unit = sheet.getCell("D5").dataValidation;
    expect(unit.type).toBe("list");
    expect(unit.formulae[0]).toBe('"Hour,Day"');

    const capability = sheet.getCell("G5").dataValidation;
    expect(capability.type).toBe("list");
    expect(capability.formulae[0]).toMatch(/^Lists!\$A\$2:\$A\$13$/);
    const list = workbook.getWorksheet("Lists")!;
    expect(list.getCell("A2").value).toBe("Client Engagement & Delivery");
    expect(list.getCell("A13").value).toBe("Marketing Operations");
  });

  it("includes a short instructions sheet", async () => {
    const workbook = await load(await buildRateCardTemplate());
    const instructions = workbook.getWorksheet("Instructions")!;
    expect(String(instructions.getCell("A1").value)).toMatch(/how to fill in/i);
    const text = (instructions.getColumn(1).values as unknown[]).join("\n");
    expect(text).toMatch(/ISO 4217|3-letter/);
    expect(text).toMatch(/Hour or Day/);
  });
});

describe("GET /api/rate-card-template", () => {
  beforeEach(() => mockAuth.mockReset());

  it("serves the template as an .xlsx download to a signed-in user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("Content-Disposition")).toContain("Rate_Card_Template.xlsx");
    const workbook = await load(Buffer.from(await response.arrayBuffer()));
    expect(workbook.getWorksheet("Rate Card")).toBeDefined();
  });

  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
