import { OfficeParser } from "officeparser";

// "xlsx" was added for Rate Cards specifically (structured role/currency/rate
// data, not prose — see the xlsx branch below, which requests officeparser's
// 'csv' output instead of 'text' for this extension so row/column structure
// survives instead of collapsing into a flat dump). Legacy binary ".xls" is
// deliberately NOT included: officeparser's SupportedFileType list has no
// "xls" entry (it only reads the modern OOXML .xlsx format), so accepting
// that extension here would just move the failure point rather than fix it.
const SUPPORTED_EXTENSIONS = ["docx", "pdf", "pptx", "txt", "xlsx"] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export class UnsupportedBriefFormatError extends Error {
  constructor(fileName: string) {
    super(
      `Unsupported file type for "${fileName}". Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}, or pasted text.`
    );
    this.name = "UnsupportedBriefFormatError";
  }
}

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Parses a brief file (docx, pdf, pptx, xlsx, or plain text) into plain text
 * for the Intake Agent (and, via extractTextFromBuffer, every commercial
 * document upload). Throws UnsupportedBriefFormatError for anything else.
 */
export async function parseDocumentToText(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const extension = getExtension(fileName);

  if (extension === "txt") {
    return buffer.toString("utf-8");
  }

  if (!SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension)) {
    throw new UnsupportedBriefFormatError(fileName);
  }

  const ast = await OfficeParser.parseOffice(buffer);

  // Spreadsheets are tabular (rows/columns of role-to-rate data), not prose —
  // 'text' output is fine for docx/pdf/pptx, but for xlsx specifically it
  // would flatten that structure. 'csv' preserves it. Checked against
  // ast.type (what officeparser actually detected), not the file extension,
  // in case of a mismatch between the two.
  if (ast.type === "xlsx") {
    const { value } = await ast.to("csv");
    return (typeof value === "string" ? value : Buffer.from(value).toString("utf-8")).trim();
  }

  const { value } = await ast.to("text", { includeImages: false });
  return value.trim();
}
