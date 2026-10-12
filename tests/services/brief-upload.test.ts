import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Deliberately NOT mocking officeparser: these run real fixture files
// through the real parser, which is what FB-002 needs proven.
vi.spyOn(console, "error").mockImplementation(() => {});

const { extractBriefText } = await import("@/services/parsing/brief");
const { validateBriefFileMeta, BRIEF_ERRORS, BRIEF_MAX_BYTES } = await import("@/lib/briefFileRules");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "brief", name));
}

function read(name: string, buffer: Buffer, type = "") {
  return extractBriefText({ name, size: buffer.length, type }, buffer);
}

describe("extractBriefText — successful extraction from real files", () => {
  it(".docx keeps headings, bullet items and table text readable", async () => {
    const result = await read("brief.docx", fixture("brief-structured.docx"), DOCX_MIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Fizzy Coffee Campaign Brief");
    expect(result.text).toContain("Objectives");
    expect(result.text).toMatch(/^- Drive awareness in the UK$/m);
    expect(result.text).toMatch(/^- Grow social following by 20%$/m);
    expect(result.text).toMatch(/\|\s*Budget\s*\|\s*GBP 150,000\s*\|/);
    expect(result.text.split("\n").length).toBeGreaterThan(5); // not one run-on block
  });

  it(".pdf extracts text", async () => {
    const result = await read("brief.pdf", fixture("brief.pdf"), "application/pdf");
    expect(result).toEqual({
      ok: true,
      text: expect.stringContaining("Caroline needs a campaign for the Tooth range."),
    });
  });

  it(".txt is read as-is", async () => {
    const result = await read("brief.txt", fixture("brief.txt"), "text/plain");
    expect(result).toEqual({ ok: true, text: expect.stringContaining("Caroline wants a Tooth range launch.") });
  });
});

describe("MIME handling", () => {
  it.each(["", "application/octet-stream", "application/zip"])(
    "accepts a valid .docx sent with MIME type %j",
    async (type) => {
      const result = await read("brief.docx", fixture("brief-structured.docx"), type);
      expect(result.ok).toBe(true);
    }
  );

  it("rejects a .docx whose MIME type is specifically something else", () => {
    expect(validateBriefFileMeta({ name: "brief.docx", size: 100, type: "image/png" })).toBe(
      BRIEF_ERRORS.unsupported
    );
  });
});

describe("rejections", () => {
  it("rejects unsupported types with a specific message", async () => {
    const result = await read("brief.png", Buffer.from([1, 2, 3]), "image/png");
    expect(result).toEqual({ ok: false, error: BRIEF_ERRORS.unsupported });
    expect(BRIEF_ERRORS.unsupported).toMatch(/Word \(\.docx\), PDF, or text file/);
  });

  it("tells users to re-save legacy .doc files as .docx", async () => {
    const result = await read("brief.doc", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), "application/msword");
    expect(result).toEqual({ ok: false, error: BRIEF_ERRORS.legacyDoc });
    expect(BRIEF_ERRORS.legacyDoc).toMatch(/\.docx/);
  });

  it("rejects oversized files before reading them", async () => {
    const result = await extractBriefText(
      { name: "big.docx", size: BRIEF_MAX_BYTES + 1, type: DOCX_MIME },
      Buffer.alloc(4)
    );
    expect(result).toEqual({ ok: false, error: BRIEF_ERRORS.tooLarge });
    expect(BRIEF_ERRORS.tooLarge).toMatch(/max 8 MB/);
  });

  it("reports no readable text for an empty file", async () => {
    const result = await extractBriefText({ name: "empty.txt", size: 0, type: "text/plain" }, Buffer.alloc(0));
    expect(result).toEqual({ ok: false, error: BRIEF_ERRORS.noText });
  });

  it("reports no readable text for a .docx with no text", async () => {
    expect(await read("empty.docx", fixture("empty.docx"))).toEqual({ ok: false, error: BRIEF_ERRORS.noText });
  });

  it("reports no readable text for an image-only/blank PDF", async () => {
    expect(await read("scan.pdf", fixture("blank.pdf"), "application/pdf")).toEqual({
      ok: false,
      error: BRIEF_ERRORS.noText,
    });
  });

  it("reports no readable text for a corrupt .docx (valid zip header, broken body)", async () => {
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("garbage garbage")]);
    expect(await read("corrupt.docx", corrupt)).toEqual({ ok: false, error: BRIEF_ERRORS.noText });
  });

  it("reports no readable text for a password-protected (CFB-wrapped) .docx", async () => {
    const encrypted = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(64)]);
    expect(await read("locked.docx", encrypted)).toEqual({ ok: false, error: BRIEF_ERRORS.noText });
  });

  it("rejects a file whose contents don't match its extension", async () => {
    expect((await read("fake.pdf", Buffer.from("just some text"))).ok).toBe(false);
    expect((await read("fake.txt", Buffer.from([0x41, 0x00, 0x42, 0x00]))).ok).toBe(false);
  });

  it("never surfaces a raw 'Invalid input'", async () => {
    const results = [
      await read("a.xyz", Buffer.from("x")),
      await read("b.docx", Buffer.from("x")),
      await read("c.pdf", Buffer.from("x")),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).not.toMatch(/invalid input/i);
    }
  });
});
