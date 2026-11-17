import type { ApprovalState } from "@/types/approvals";
import { formatApprovalDate } from "@/lib/commercial/approvalCopy";
import { StatusBadge } from "./StatusBadge";

/**
 * The status of an estimate or SOW version — never colour alone: icon + text,
 * with an accessible name. A thin wrapper over the shared StatusBadge (FB-012).
 * Sits inline next to the version title (not top-right, where stage-status
 * badges live) so document status is never mistaken for stage status.
 */
export function DocumentStatusBadge({
  state,
  approvedOn,
  className = "",
}: {
  state: ApprovalState;
  /** YYYY-MM-DD client approval date — shown for the approved state. */
  approvedOn?: string | null;
  className?: string;
}) {
  let text: string;
  let title: string | undefined;
  switch (state) {
    case "draft":
      text = "Draft";
      title = "Not yet approved by the client";
      break;
    case "approved":
      text = approvedOn ? `Client approved · ${formatApprovalDate(approvedOn)}` : "Client approved";
      break;
    case "superseded":
      text = "Superseded";
      title = "A newer version exists";
      break;
    case "not_approved":
      text = "Not approved";
      title = "Another estimate in this project was approved by the client";
      break;
  }
  return (
    <StatusBadge
      state={state}
      text={text}
      title={title}
      ariaLabel={`Document status: ${text}`}
      className={className}
    />
  );
}
