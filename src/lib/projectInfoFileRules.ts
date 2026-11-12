/**
 * FB-010: client-safe rules for the Add project information panel's files —
 * shared by the panel (instant feedback) and the server action, like the
 * New Project brief upload (briefFileRules.ts), plus PowerPoint. Spreadsheets
 * aren't accepted here: they're tabular (rate cards), not project notes.
 */
import {
  BRIEF_MAX_BYTES,
  validateUploadMeta,
  type BriefFileMeta,
  type UploadRules,
} from "@/lib/briefFileRules";

export const INFO_ALLOWED_EXTENSIONS = ["docx", "pdf", "pptx", "txt"] as const;

/** Per file. Each file is sent in its own request, under the 10 MB server action limit. */
export const INFO_MAX_BYTES = BRIEF_MAX_BYTES;

export const INFO_ACCEPT_ATTRIBUTE = ".docx,.pdf,.pptx,.txt";

export const INFO_ERRORS = {
  unsupported:
    "This file type isn't supported. Add a Word (.docx), PDF, PowerPoint (.pptx) or text file.",
  legacyDoc:
    "Older Word (.doc) and PowerPoint (.ppt) files can't be read. Save it as .docx or .pptx and add that.",
  tooLarge: `This file is too large (max ${INFO_MAX_BYTES / 1024 / 1024} MB).`,
  noText: "We couldn't read any text from this file.",
} as const;

export const INFO_RULES: UploadRules = {
  allowedExtensions: INFO_ALLOWED_EXTENSIONS,
  maxBytes: INFO_MAX_BYTES,
  errors: INFO_ERRORS,
};

export function validateInfoFileMeta(file: BriefFileMeta): string | null {
  return validateUploadMeta(file, INFO_RULES);
}

export const INFO_CATEGORIES = [
  { id: "MEETING_NOTES", label: "Meeting notes" },
  { id: "CLIENT_CLARIFICATION", label: "Client clarification" },
  { id: "PRESENTATION_OR_DOCUMENT", label: "Presentation or document" },
  { id: "OTHER", label: "Other" },
] as const;

export type InfoCategory = (typeof INFO_CATEGORIES)[number]["id"];

export function infoCategoryLabel(category: string | null | undefined): string | null {
  return INFO_CATEGORIES.find((c) => c.id === category)?.label ?? null;
}
