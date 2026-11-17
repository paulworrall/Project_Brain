"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  confirmScopeAction,
  reopenScopeAction,
} from "@/app/(dashboard)/projects/[projectId]/step-actions";
import { shortDate } from "@/lib/projectSteps";

/**
 * The end of the Brief step (FB-008): "Confirm scope is ready to estimate".
 * Opens a confirmation dialog that warns (never blocks) about any open
 * questions still in the scope summary and a missing MSA / rate card (FB-011). Once confirmed, a low-emphasis "Reopen scope"
 * clears it — disabled once an estimate is approved, or the project is complete.
 */
/** The Confirm scope dialog's warning lines (FB-011). Pure, exported for tests. */
export function scopeGateWarnings({
  openQuestions,
  missingMsaRateCard,
  clientName,
}: {
  openQuestions: number;
  missingMsaRateCard: boolean;
  clientName: string;
}): string[] {
  const warnings: string[] = [];
  if (openQuestions > 0) {
    warnings.push(
      openQuestions === 1
        ? "1 open question is still in the scope summary."
        : `${openQuestions} open questions are still in the scope summary.`
    );
  }
  if (missingMsaRateCard) {
    warnings.push(
      `No MSA and rate card are set for ${clientName}, so the estimate can't be priced yet.`
    );
  }
  return warnings;
}

export function ScopeGate({
  projectId,
  scopeConfirmedAt,
  scopeConfirmedByName,
  openQuestions,
  missingMsaRateCard,
  clientName,
  estimateApproved,
  projectComplete,
}: {
  projectId: string;
  scopeConfirmedAt: string | null;
  scopeConfirmedByName: string | null;
  /** Open questions in the scope summary (stored plus required key details outstanding). */
  openQuestions: number;
  /** The project has no MSA and rate card yet, so the estimate can't be priced. */
  missingMsaRateCard: boolean;
  clientName: string;
  estimateApproved: boolean;
  projectComplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reopenNoteId = useId();
  const warnings = scopeGateWarnings({ openQuestions, missingMsaRateCard, clientName });

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
      <div id="scope-gate" className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 border border-border bg-surface px-4 py-3">
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
          <Button
            type="button"
            variant="tertiary"
            disabled={reopenBlocked || pending}
            locked={reopenBlocked}
            aria-describedby={reopenBlocked && !projectComplete ? reopenNoteId : undefined}
            onClick={() => run(reopenScopeAction)}
          >
            {pending ? "Reopening…" : "Reopen scope"}
          </Button>
          {reopenBlocked && !projectComplete && (
            <p id={reopenNoteId} className="text-xs text-muted-foreground">
              The client has approved an estimate, so the scope can&apos;t be reopened. Changes will
              need a change request (coming soon).
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
    <div id="scope-gate" className="scroll-mt-6 border border-border bg-surface px-4 py-3">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        disabled={projectComplete}
        locked={projectComplete}
        onClick={() => setOpen(true)}
        className="mt-2"
      >
        Confirm scope is ready to estimate
      </Button>
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
            {warnings.length > 0 ? (
              <div className="border border-warning bg-warning-bg px-3 py-2">
                <p className="font-medium">
                  <span aria-hidden="true">! </span>
                  {warnings.length === 1 ? "Before you confirm:" : "Before you confirm, note that:"}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p className="mt-1">You can still confirm.</p>
              </div>
            ) : (
              <p>No open questions, and the MSA and rate card are in place.</p>
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                Cancel
              </Button>
              <Button type="button" disabled={pending} onClick={() => run(confirmScopeAction)}>
                {pending ? "Confirming…" : "Confirm scope"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
