// Client-safe rules for the New Project "Brief" file upload — no Node or
// parser imports, so the form (client) and the server action share one
// source of truth for what's accepted and what the user is told.

export const BRIEF_ALLOWED_EXTENSIONS = ["docx", "pdf", "txt"] as const;
export type BriefExtension = (typeof BRIEF_ALLOWED_EXTENSIONS)[number];

// Must stay below next.config.ts serverActions.bodySizeLimit (10mb), which
// caps the whole request (form fields included), not just the file.
export const BRIEF_MAX_BYTES = 8 * 1024 * 1024;

export const BRIEF_ACCEPT_ATTRIBUTE = ".docx,.pdf,.txt";

export const BRIEF_ERRORS = {
  unsupported: "This file type isn't supported. Upload a Word (.docx), PDF, or text file.",
  legacyDoc:
    "Older Word (.doc) files can't be read. Open it in Word, choose Save As → Word Document (.docx), and upload that.",
  tooLarge: `This file is too large (max ${BRIEF_MAX_BYTES / 1024 / 1024} MB).`,
  noText: "We couldn't read any text from this file.",
} as const;

const EXPECTED_MIME: Record<BriefExtension, string[]> = {
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
};

// Types browsers/OSes send when they don't recognise the file or only know it
// as a container. These say nothing against the extension, so they never
// cause a rejection on their own (the file signature is checked server-side).
const NEUTRAL_MIME = new Set([
  "",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "binary/octet-stream",
]);

export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export interface BriefFileMeta {
  name: string;
  size: number;
  type: string;
}

/**
 * Cheap checks that need no file contents: extension, MIME type, size.
 * Returns a user-facing message, or null if the file may proceed to reading.
 * A valid .docx is never rejected for an empty/generic MIME type — only a
 * specific type that contradicts the extension (e.g. image/png) is.
 */
export function validateBriefFileMeta(file: BriefFileMeta): string | null {
  const ext = getFileExtension(file.name);
  if (ext === "doc") return BRIEF_ERRORS.legacyDoc;
  if (!(BRIEF_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return BRIEF_ERRORS.unsupported;
  }

  const mime = file.type.trim().toLowerCase();
  if (!NEUTRAL_MIME.has(mime)) {
    const matchesExtension = EXPECTED_MIME[ext as BriefExtension].includes(mime);
    // .txt files are routinely labelled with other text/* types (text/markdown, text/csv).
    const looseTextOk = ext === "txt" && mime.startsWith("text/");
    if (!matchesExtension && !looseTextOk) {
      return mime === "application/msword" ? BRIEF_ERRORS.legacyDoc : BRIEF_ERRORS.unsupported;
    }
  }

  if (file.size === 0) return BRIEF_ERRORS.noText;
  if (file.size > BRIEF_MAX_BYTES) return BRIEF_ERRORS.tooLarge;
  return null;
}
