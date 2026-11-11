"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  confirmScopeAction,
  reopenScopeAction,
} from "@/app/(dashboard)/projects/[projectId]/step-actions";
import { shortDate } from "@/lib/projectSteps";

/**
 * The end of the Brief step (FB-008): "Confirm scope is ready to estimate".
 * Opens a confirmation dialog that lists any unticked Brief readiness items as
 * a warning (not blocking). Once confirmed, a low-emphasis "Reopen scope"
 * clears it — disabled once an estimate is approved, or the project is complete.
 */
export function ScopeGate({
  projectId,
  scopeConfirmedAt,
  scopeConfirmedByName,
  outstanding,
  estimateApproved,
  projectComplete,
}: {
  projectId: string;
  scopeConfirmedAt: string | null;
  scopeConfirmedByName: string | null;
  /** Unticked Brief readiness items (system checks and checklist items). */
  outstanding: string[];
  estimateApproved: boolean;
  projectComplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reopenNoteId = useId();

  function run(action: typeof confirmScopeAction) {
    setError(null);
    startTransition(async () => {
      const result = await action({ projectId });
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  }

  if (scopeConfirmedAt) {
    const reopenBlocked = estimateApproved || projectComplete;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
          >
            ✓
          </span>
          Scope confirmed {shortDate(scopeConfirmedAt)}
          {scopeConfirmedByName ? ` by ${scopeConfirmedByName}` : ""}
        </p>
        <div className="text-right">
          <button
            type="button"
            disabled={reopenBlocked || pending}
            aria-describedby={reopenBlocked ? reopenNoteId : undefined}
            onClick={() => run(reopenScopeAction)}
            className="min-h-11 px-2 text-sm font-medium text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {pending ? "Reopening…" : "Reopen scope"}
          </button>
          {reopenBlocked && (
            <p id={reopenNoteId} className="text-xs text-muted-foreground">
              {projectComplete
                ? "This project is complete. Changes will need a change request (coming soon)."
                : "The client has approved an estimate, so the scope can't be reopened. Changes will need a change request (coming soon)."}
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="text-sm text-muted-foreground">
        When the scope is clear enough to estimate, confirm it to move on to the estimate.
      </p>
      <button
        ref={triggerRef}
        type="button"
        disabled={projectComplete}
        onClick={() => setOpen(true)}
        className="mt-2 min-h-11 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Confirm scope is ready to estimate
      </button>
      {error && !open && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {open && (
        <Modal
          isOpen
          title="Confirm the scope is ready to estimate?"
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <div className="space-y-3 text-sm text-foreground">
            {outstanding.length > 0 ? (
              <div className="border border-warning bg-warning-bg px-3 py-2">
                <p className="font-medium">
                  <span aria-hidden="true">! </span>
                  {outstanding.length === 1
                    ? "1 readiness item isn't done yet:"
                    : `${outstanding.length} readiness items aren't done yet:`}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {outstanding.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <p className="mt-1">You can still confirm.</p>
              </div>
            ) : (
              <p>Every Brief readiness item is done.</p>
            )}
            <p className="text-muted-foreground">
              You can reopen the scope later, until an estimate is approved.
            </p>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="min-h-11 border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-line-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(confirmScopeAction)}
                className="min-h-11 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Confirming…" : "Confirm scope"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
