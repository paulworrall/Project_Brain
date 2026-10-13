import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateCardXlsxFile, validRow } from "./helpers/rateCardWorkbook";

// The preview step must parse and validate but never write anything.
const writes = vi.hoisted(() => ({ create: vi.fn(), createMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateCard: { create: writes.create, findFirst: vi.fn() },
    rateCardVersion: { create: writes.create, createMany: writes.createMany, update: writes.update, findFirst: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.spyOn(console, "error").mockImplementation(() => {});

const { previewRateCardUploadAction, uploadRateCardVersionAction } = await import(
  "@/app/(dashboard)/clients/[clientId]/actions"
);

async function formWith(file: File): Promise<FormData> {
  const formData = new FormData();
  formData.set("file", file);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "CLIENT_ENGAGEMENT" } });
});

describe("previewRateCardUploadAction", () => {
  it("returns the parsed lines and a currency summary, and saves nothing", async () => {
    const file = await rateCardXlsxFile([
      validRow({ Currency: "GBP" }),
      validRow({ Role: "A", Currency: "GBP" }),
      validRow({ Role: "B", Currency: "EUR", Rate: 700.5 }),
    ]);

    const result = await previewRateCardUploadAction(await formWith(file));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe("3 rates: 2 GBP, 1 EUR");
    expect(result.currencies).toEqual(["GBP", "EUR"]);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[2]).toMatchObject({ currency: "EUR", rate: "700.5" });
    expect(writes.create).not.toHaveBeenCalled();
    expect(writes.createMany).not.toHaveBeenCalled();
  });

  it("returns every validation error and saves nothing", async () => {
    const file = await rateCardXlsxFile([validRow({ Currency: "EURO" }), validRow({ Unit: "Week" })]);

    const result = await previewRateCardUploadAction(await formWith(file));

    expect(result).toEqual({
      ok: false,
      errors: [
        "Row 2: 'EURO' isn't a valid currency code, use EUR.",
        "Row 3: 'Week' isn't a valid unit, use Hour or Day.",
      ],
    });
    expect(writes.create).not.toHaveBeenCalled();
  });

  it("refuses non-Client-Engagement users", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u2", role: "DELIVERY" } });
    const result = await previewRateCardUploadAction(await formWith(await rateCardXlsxFile()));
    expect(result.ok).toBe(false);
  });
});

describe("uploadRateCardVersionAction — new versions are never the default", () => {
  it("creates the version DISABLED with its rate lines, leaving promotion to the explicit action", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.rateCard.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "rc1" });
    (prisma.rateCardVersion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ versionNumber: 3 });

    const result = await uploadRateCardVersionAction(
      "client1",
      "rc1",
      undefined,
      await formWith(await rateCardXlsxFile([validRow({ Rate: 62.125 })], "v4.xlsx"))
    );

    expect(result?.message).toBeUndefined();
    expect(writes.create).toHaveBeenCalledTimes(1);
    const data = writes.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ versionNumber: 4, status: "DISABLED", fileName: "v4.xlsx" });
    expect(data.lineItems.create[0]).toMatchObject({ currency: "GBP", rate: "62.125", rateType: "DAILY" });
  });
});
