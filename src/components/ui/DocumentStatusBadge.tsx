import type { ApprovalState } from "@/types/approvals";
import { formatApprovalDate } from "@/lib/commercial/approvalCopy";

const ICON_PROPS = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

function PencilIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

const STYLES: Record<ApprovalState, string> = {
  draft: "bg-warning-bg text-foreground border-warning",
  approved: "bg-success-bg text-foreground border-success",
  superseded: "bg-surface-muted text-muted-foreground border-border",
  not_approved: "bg-surface-muted text-muted-foreground border-border",
};

/**
 * The status of an estimate or SOW version — never colour alone: icon + text,
 * with an accessible name. Sits inline next to the version title (not top-right,
 * where stage-status badges live) so document status is never mistaken for
 * stage status.
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
  let icon = <PencilIcon />;
  switch (state) {
    case "draft":
      text = "Draft";
      title = "Not yet approved by the client";
      break;
    case "approved":
      text = approvedOn ? `Client approved · ${formatApprovalDate(approvedOn)}` : "Client approved";
      icon = <LockIcon />;
      break;
    case "superseded":
      text = "Superseded";
      title = "A newer version exists";
      icon = <MinusIcon />;
      break;
    case "not_approved":
      text = "Not approved";
      title = "Another estimate in this project was approved by the client";
      icon = <MinusIcon />;
      break;
  }

  return (
    <span
      role="img"
      aria-label={`Document status: ${text}`}
      title={title}
      data-state={state}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 align-middle text-xs font-medium ${STYLES[state]} ${className}`}
    >
      {icon}
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
