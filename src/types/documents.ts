import type { DocumentType } from "@/generated/prisma/enums";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CLARIFICATION_EMAIL: "Clarification Email",
  POSITION_DOCUMENT: "Project Position Document",
  CHECKLIST: "Project Set-Up Checklist",
  DRAFT_SCOPE_DOCUMENT: "Draft Scope Document",
  DELIVERABLES_SERVICES_DOCUMENT: "Deliverables + Services Document",
  SCOPE_SUMMARY: "Scope summary",
};

/**
 * FB-011: the clarification email and the set-up checklist are no longer
 * produced or shown. Their documents are kept in the database, but the
 * Outputs Library neither lists nor opens them.
 */
export const RETIRED_DOCUMENT_TYPES: readonly DocumentType[] = ["CLARIFICATION_EMAIL", "CHECKLIST"];

/** Display order for the Outputs Library — matches the stage each artifact is first produced at. */
export const DOCUMENT_TYPE_ORDER: DocumentType[] = [
  "SCOPE_SUMMARY",
  "POSITION_DOCUMENT",
  "DRAFT_SCOPE_DOCUMENT",
  "DELIVERABLES_SERVICES_DOCUMENT",
];
