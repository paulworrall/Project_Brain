import type { DocumentType } from "@/generated/prisma/enums";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CLARIFICATION_EMAIL: "Clarification Email",
  POSITION_DOCUMENT: "Project Position Document",
  CHECKLIST: "Project Set-Up Checklist",
  DRAFT_SCOPE_DOCUMENT: "Draft Scope Document",
  DELIVERABLES_SERVICES_DOCUMENT: "Deliverables + Services Document",
};

/** Display order for the Outputs Library — matches the stage each artifact is first produced at. */
export const DOCUMENT_TYPE_ORDER: DocumentType[] = [
  "CLARIFICATION_EMAIL",
  "POSITION_DOCUMENT",
  "CHECKLIST",
  "DRAFT_SCOPE_DOCUMENT",
  "DELIVERABLES_SERVICES_DOCUMENT",
];
