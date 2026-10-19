"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import {
  approveEstimateVersion,
  approveSowVersion,
  revertApprovalAction,
  undoApprovalAction,
} from "@/app/(dashboard)/projects/[projectId]/approval-actions";
import { APPROVAL_ERROR_COPY, documentLabel } from "@/lib/commercial/approvalCopy";
import { UNDO_WINDOW_MS } from "@/lib/undoWindow";
import type {
  ActionResult,
  ApprovalInfo,
  ApprovalPermissions,
  ApprovalState,
  CommercialDocumentTypeName,
} from "@/types/approvals";
import { ApproveVersionDialog, type ApproveDialogSummary } from "./ApproveVersionDialog";
import { RevertApprovalDialog } from "./RevertApprovalDialog";

/**
 * The approve / undo / revert controls for ONE version card. It stays mounted
 * across the router.refresh() that follows an approval (the card re-renders in
 * place), which is what lets the success toast + its 10-second Undo outlive the
 * button that triggered it.
 */
export function ApprovalActions({
  documentType,
  versionId,
  versionNumber,
  approvalState,
  approval,
  permissions,
  summary,
  blockedReason = null,
  focusId,
}: {
  documentType: CommercialDocumentTypeName;
  versionId: string;
  versionNumber: number;
  approvalState: ApprovalState;
  approval: ApprovalInfo | null;
  permissions: ApprovalPermissions;
  summary: ApproveDialogSummary;
  /** Why approving is currently impossible (shown inline; the button stays focusable). */
  blockedReason?: string | null;
  /** DOM id of the version card — focus returns here after an approval. */
  focusId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const reasonId = useId();
  const [approveOpen, setApproveOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [toast, setToast] = useState<{ approvalId: string; error?: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const label = documentLabel(documentType);

  // The undo toast lives for the 10-second window.
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function refreshAfter(message: string, focus: boolean) {
    setAnnouncement(message);
    startTransition(() => router.refresh());
    if (focus) setTimeout(() => document.getElementById(focusId)?.focus(), 100);
  }

  async function handleApprove(input: {
    versionId: string;
    clientApprovedOn: string;
    clientApproverName: string;
    reference?: string;
  }): Promise<ActionResult<unknown>> {
    const result = await (documentType === "ESTIMATE"
      ? approveEstimateVersion(input)
      : approveSowVersion(input));
    if (result.ok) {
      setApproveOpen(false);
      setToast({ approvalId: result.data.approvalId });
      refreshAfter(`${label} v${versionNumber} marked as client approved`, true);
    } else if (!result.fieldErrors) {
      return { ...result, message: result.message || APPROVAL_ERROR_COPY[result.code] };
    }
    return result;
  }

  async function handleUndo() {
    if (!toast) return;
    const result = await undoApprovalAction({ approvalId: toast.approvalId });
    if (result.ok) {
      setToast(null);
      refreshAfter(`${label} v${versionNumber} returned to draft`, true);
    } else {
      setToast({
        approvalId: toast.approvalId,
        error: result.message || APPROVAL_ERROR_COPY[result.code],
      });
    }
  }

  async function handleRevert(input: {
    approvalId: string;
    reason: string;
  }): Promise<ActionResult<unknown>> {
    const result = await revertApprovalAction(input);
    if (result.ok) {
      setRevertOpen(false);
      refreshAfter(`${label} v${versionNumber} reverted to draft`, true);
    }
    return result;
  }

  const showApprove = permissions.canApprove && approvalState === "draft";
  const showRevert = permissions.canRevert && approvalState === "approved" && !!approval;

  return (
    <>
      {showApprove && (
        <div className="space-y-1">
          <Button
            type="button"
            variant="secondary"
            className={`text-xs ${blockedReason ? "cursor-not-allowed opacity-50" : ""}`}
            aria-disabled={blockedReason ? true : undefined}
            aria-describedby={blockedReason ? reasonId : undefined}
            onClick={() => {
              if (!blockedReason) setApproveOpen(true);
            }}
          >
            Mark as client approved
          </Button>
          {blockedReason && (
            <p id={reasonId} className="text-xs text-muted-foreground">
              {blockedReason}
            </p>
          )}
        </div>
      )}
      {showRevert && (
        <Button
          type="button"
          variant="ghost"
          className="px-2 py-1 text-xs text-muted-foreground"
          onClick={() => setRevertOpen(true)}
        >
          Revert to draft
        </Button>
      )}

      <ApproveVersionDialog
        isOpen={approveOpen}
        onClose={() => setApproveOpen(false)}
        documentType={documentType}
        versionId={versionId}
        summary={summary}
        onSubmit={handleApprove}
      />
      {approval && (
        <RevertApprovalDialog
          isOpen={revertOpen}
          onClose={() => setRevertOpen(false)}
          approvalId={approval.id}
          documentName={`${label} v${versionNumber}`}
          onSubmit={handleRevert}
        />
      )}

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      {toast && (
        <Toast onDismiss={() => setToast(null)}>
          {toast.error ? (
            <span role="alert">{toast.error}</span>
          ) : (
            <>
              {label} v{versionNumber} marked as client approved.{" "}
              <button
                type="button"
                onClick={() => void handleUndo()}
                className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Undo
              </button>
            </>
          )}
        </Toast>
      )}
    </>
  );
}
