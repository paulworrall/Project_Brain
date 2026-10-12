import { parseDocumentToText } from "@/services/parsing";
import {
  BRIEF_ERRORS,
  getFileExtension,
  validateBriefFileMeta,
  type BriefFileMeta,
} from "@/lib/briefFileRules";

export type BriefTextResult = { ok: true; text: string } | { ok: false; error: string };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .doc, and password-protected OOXML

function startsWith(buffer: Buffer, magic: number[]): boolean {
  return magic.every((byte, i) => buffer[i] === byte);
}

/**
 * Single entry point for turning an uploaded Brief file into plain text —
 * used by both the preview action and createProjectAction, so what the user
 * sees in the preview is exactly what the Intake Agent receives. Never
 * throws; every failure is a specific, user-facing message.
 */
export async function extractBriefText(
  file: BriefFileMeta,
  buffer: Buffer
): Promise<BriefTextResult> {
  const metaError = validateBriefFileMeta(file);
  if (metaError) return { ok: false, error: metaError };

  const ext = getFileExtension(file.name);

  // Signature check: the extension alone is trivially wrong or spoofed.
  if (ext === "docx" && !startsWith(buffer, ZIP_MAGIC)) {
    // A real legacy .doc renamed to .docx, or a password-protected file.
    return {
      ok: false,
      error: startsWith(buffer, CFB_MAGIC) ? BRIEF_ERRORS.noText : BRIEF_ERRORS.unsupported,
    };
  }
  if (ext === "pdf" && !buffer.subarray(0, 1024).toString("latin1").includes("%PDF-")) {
    return { ok: false, error: BRIEF_ERRORS.unsupported };
  }
  if (ext === "txt" && buffer.subarray(0, 8192).includes(0)) {
    return { ok: false, error: BRIEF_ERRORS.unsupported };
  }

  let text: string;
  try {
    text = await parseDocumentToText(buffer, file.name);
  } catch (error) {
    console.error(`extractBriefText: failed to parse "${file.name}"`, error);
    return { ok: false, error: BRIEF_ERRORS.noText };
  }

  const cleaned = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length === 0) return { ok: false, error: BRIEF_ERRORS.noText };
  return { ok: true, text: cleaned };
}
