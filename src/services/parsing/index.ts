import { OfficeParser } from "officeparser";

const SUPPORTED_EXTENSIONS = ["docx", "pdf", "pptx", "txt"] as const;
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
 * Parses a brief file (docx, pdf, pptx, or plain text) into plain text for
 * the Intake Agent. Throws UnsupportedBriefFormatError for anything else.
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
  const { value } = await ast.to("text", { includeImages: false });
  return value.trim();
}
