import { lockedMessage } from "@/lib/commercial/approvalCopy";

/**
 * The visible reason a control is locked. Locked controls stay on screen and
 * focusable (aria-disabled) — this note explains why they do nothing.
 */
export function LockedNotice({
  versionNumber,
  clientApprovedOn,
  className = "",
}: {
  versionNumber: number;
  /** YYYY-MM-DD */
  clientApprovedOn: string;
  className?: string;
}) {
  return (
    <p role="note" className={`text-xs text-muted-foreground ${className}`}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mr-1 inline-block align-[-1px]"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {lockedMessage(versionNumber, clientApprovedOn)}
    </p>
  );
}
