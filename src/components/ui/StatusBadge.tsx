import type { ReactNode } from "react";

/**
 * The one status badge (FB-012). Always icon + text — never colour alone — at
 * 14px, with an accessible name. States:
 *   not_started   outline circle, neutral
 *   in_progress   half-filled circle, amber tint
 *   done          tick, green tint
 *   needs_review  warning triangle, amber
 *   locked        lock, muted
 *   draft         pencil, neutral
 *   approved      lock, green  (text usually "Client approved · {date}")
 *   superseded    minus circle, muted
 *   not_approved  minus circle, muted
 * DocumentStatusBadge (estimate / SOW versions) is a thin wrapper over this.
 */
export type StatusBadgeState =
  | "not_started"
  | "in_progress"
  | "done"
  | "needs_review"
  | "locked"
  | "draft"
  | "approved"
  | "superseded"
  | "not_approved";

export const STATUS_BADGE_TEXT: Record<StatusBadgeState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  needs_review: "Needs review",
  locked: "Locked",
  draft: "Draft",
  approved: "Client approved",
  superseded: "Superseded",
  not_approved: "Not approved",
};

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  className: "shrink-0",
};

export function StatusIcon({ state }: { state: StatusBadgeState }): ReactNode {
  switch (state) {
    case "not_started":
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </svg>
      );
    case "done":
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.3l2.6 2.6L16 9.4" />
        </svg>
      );
    case "needs_review":
      return (
        <svg {...ICON_PROPS}>
          <path d="M12 3.5 22 20H2z" />
          <path d="M12 10v5M12 17.5v.01" />
        </svg>
      );
    case "locked":
    case "approved":
      return (
        <svg {...ICON_PROPS}>
          <rect x="4" y="11" width="16" height="10" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "draft":
      return (
        <svg {...ICON_PROPS}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "superseded":
    case "not_approved":
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
      );
  }
}

const STYLES: Record<StatusBadgeState, string> = {
  not_started: "bg-surface text-foreground border-border-strong",
  in_progress: "bg-tint text-navy border-amber",
  done: "bg-rag-green text-navy border-rag-green",
  needs_review: "bg-rag-amber text-navy border-rag-amber",
  locked: "bg-surface-muted text-muted-foreground border-border-strong",
  draft: "bg-surface text-foreground border-border-strong",
  approved: "bg-rag-green text-navy border-rag-green",
  superseded: "bg-surface text-muted-foreground border-border-strong",
  not_approved: "bg-surface text-muted-foreground border-border-strong",
};

export function StatusBadge({
  state,
  text,
  title,
  ariaLabel,
  className = "",
}: {
  state: StatusBadgeState;
  /** Overrides the default wording, e.g. "Client approved · 19 Oct 2026" or "Received". */
  text?: string;
  title?: string;
  /** Overrides the accessible name (default: "Status: {text}"). */
  ariaLabel?: string;
  className?: string;
}) {
  const label = text ?? STATUS_BADGE_TEXT[state];
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `Status: ${label}`}
      title={title}
      data-state={state}
      className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 align-middle text-xs font-medium whitespace-nowrap ${STYLES[state]} ${className}`}
    >
      <StatusIcon state={state} />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
