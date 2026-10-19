import type { ApprovalState } from "@/types/approvals";

export interface ApprovalStateInput {
  /** This exact version has an active (not revoked) approval. */
  hasActiveApproval: boolean;
  /** It is the highest-numbered version of its own document. */
  isLatestVersion: boolean;
  /** The project has an active approval on some OTHER version/document of this type. */
  projectHasOtherApproval: boolean;
}

/**
 * The single source of truth for a version's status, used by server and UI
 * alike so they can never disagree. Status is derived, never stored:
 * approved > not approved (another estimate is approved) > superseded (an
 * older, unapproved version) > draft.
 */
export function deriveApprovalState(input: ApprovalStateInput): ApprovalState {
  if (input.hasActiveApproval) return "approved";
  if (input.projectHasOtherApproval) return "not_approved";
  if (!input.isLatestVersion) return "superseded";
  return "draft";
}
