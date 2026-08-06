import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("officeparser", () => {
  const to = vi.fn().mockResolvedValue({ value: "  extracted text  " });
  const parseOffice = vi.fn().mockResolvedValue({ to });
  return { OfficeParser: { parseOffice }, __mockTo: to, __mockParseOffice: parseOffice };
});

const { parseDocumentToText, UnsupportedBriefFormatError } = await import(
  "@/services/parsing"
);
const officeparser = (await import("officeparser")) as unknown as {
  __mockParseOffice: ReturnType<typeof vi.fn>;
  __mockTo: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  officeparser.__mockParseOffice.mockClear();
  officeparser.__mockTo.mockClear();
});

describe("parseDocumentToText", () => {
  it("reads .txt files directly without invoking officeparser", async () => {
    const buffer = Buffer.from("plain pasted brief text", "utf-8");

    const result = await parseDocumentToText(buffer, "brief.txt");

    expect(result).toBe("plain pasted brief text");
    expect(officeparser.__mockParseOffice).not.toHaveBeenCalled();
  });

  it("parses .docx files via officeparser and trims the result", async () => {
    const result = await parseDocumentToText(Buffer.from("fake docx bytes"), "brief.docx");

    expect(result).toBe("extracted text");
    expect(officeparser.__mockParseOffice).toHaveBeenCalledTimes(1);
  });

  it("parses .pdf files via officeparser", async () => {
    await parseDocumentToText(Buffer.from("fake pdf bytes"), "brief.pdf");
    expect(officeparser.__mockParseOffice).toHaveBeenCalledTimes(1);
  });

  it("parses .pptx files via officeparser", async () => {
    await parseDocumentToText(Buffer.from("fake pptx bytes"), "brief.pptx");
    expect(officeparser.__mockParseOffice).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported file extensions", async () => {
    await expect(
      parseDocumentToText(Buffer.from("data"), "brief.xlsx")
    ).rejects.toThrow(UnsupportedBriefFormatError);
    expect(officeparser.__mockParseOffice).not.toHaveBeenCalled();
  });
});
