import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";

/**
 * Shared wrapper around parseDocumentToText for Server Actions that upload a
 * commercial document file (MSA, Rate Card, SOW Template) — turns a thrown
 * UnsupportedBriefFormatError (or any other parse failure) into the
 * `{ message }` shape these actions already return for validation errors,
 * so callers can `if ("message" in extracted) return extracted;` uniformly.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ extractedText: string } | { message: string }> {
  try {
    return { extractedText: await parseDocumentToText(buffer, fileName) };
  } catch (error) {
    if (error instanceof UnsupportedBriefFormatError) {
      return { message: error.message };
    }
    console.error(`extractTextFromBuffer: failed to parse "${fileName}"`, error);
    return { message: "Couldn't read that file." };
  }
}
