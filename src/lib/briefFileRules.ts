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

const EXPECTED_MIME: Record<string, string[]> = {
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
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

/** What a file upload accepts, and what the user is told when a file isn't accepted. */
export interface UploadRules {
  allowedExtensions: readonly string[];
  maxBytes: number;
  errors: { unsupported: string; legacyDoc: string; tooLarge: string; noText: string };
}

export const BRIEF_RULES: UploadRules = {
  allowedExtensions: BRIEF_ALLOWED_EXTENSIONS,
  maxBytes: BRIEF_MAX_BYTES,
  errors: BRIEF_ERRORS,
};

/**
 * Cheap checks that need no file contents: extension, MIME type, size.
 * Returns a user-facing message, or null if the file may proceed to reading.
 * A valid .docx is never rejected for an empty/generic MIME type — only a
 * specific type that contradicts the extension (e.g. image/png) is.
 */
export function validateUploadMeta(file: BriefFileMeta, rules: UploadRules): string | null {
  const ext = getFileExtension(file.name);
  if (ext === "doc" || ext === "ppt") return rules.errors.legacyDoc;
  if (!rules.allowedExtensions.includes(ext)) {
    return rules.errors.unsupported;
  }

  const mime = file.type.trim().toLowerCase();
  if (!NEUTRAL_MIME.has(mime)) {
    const matchesExtension = (EXPECTED_MIME[ext] ?? []).includes(mime);
    // .txt files are routinely labelled with other text/* types (text/markdown, text/csv).
    const looseTextOk = ext === "txt" && mime.startsWith("text/");
    if (!matchesExtension && !looseTextOk) {
      return mime === "application/msword" || mime === "application/vnd.ms-powerpoint"
        ? rules.errors.legacyDoc
        : rules.errors.unsupported;
    }
  }

  if (file.size === 0) return rules.errors.noText;
  if (file.size > rules.maxBytes) return rules.errors.tooLarge;
  return null;
}

export function validateBriefFileMeta(file: BriefFileMeta): string | null {
  return validateUploadMeta(file, BRIEF_RULES);
}
