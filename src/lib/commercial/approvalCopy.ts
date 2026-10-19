import type { ApprovalErrorCode, CommercialDocumentTypeName } from "@/types/approvals";

/** "18 Oct 2026" from a YYYY-MM-DD calendar date (never shifted by timezone). */
export function formatApprovalDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function documentLabel(type: CommercialDocumentTypeName): string {
  return type === "ESTIMATE" ? "Estimate" : "SOW";
}

export function lockedMessage(versionNumber: number, clientApprovedOn: string): string {
  return `Locked — the client approved v${versionNumber} on ${formatApprovalDate(clientApprovedOn)}. Changes will be handled through change requests (coming soon).`;
}

/** User-facing copy for each action error code. */
export const APPROVAL_ERROR_COPY: Record<ApprovalErrorCode, string> = {
  ALREADY_APPROVED:
    "Someone has already recorded an approval for this document. Refresh to see it.",
  NOT_LATEST_VERSION: "Only the latest version can be approved. Refresh to see the newest version.",
  ESTIMATE_NOT_APPROVED: "Approve the estimate first.",
  SOW_SOURCE_MISMATCH:
    "This SOW wasn't generated from the approved estimate. Regenerate the SOW first.",
  LOCKED: "This document is locked because the client has approved it.",
  UNDO_WINDOW_EXPIRED:
    "The 10-second undo window has passed. Only an admin can revert this approval.",
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION: "Check the highlighted fields and try again.",
};
