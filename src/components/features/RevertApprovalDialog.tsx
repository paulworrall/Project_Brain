"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RevertApprovalSchema, fieldErrorsFrom, type ActionResult } from "@/types/approvals";

/** Admin-only: returns an approved version to draft, with a required reason. */
export function RevertApprovalDialog({
  isOpen,
  onClose,
  approvalId,
  documentName,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  approvalId: string;
  documentName: string;
  onSubmit: (input: { approvalId: string; reason: string }) => Promise<ActionResult<unknown>>;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsed = RevertApprovalSchema.safeParse({ approvalId, reason });
  const reasonError = !parsed.success ? fieldErrorsFrom(parsed.error).reason : undefined;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!parsed.success || pending) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await onSubmit(parsed.data);
      if (!result.ok) setFormError(result.fieldErrors?.reason ?? result.message);
    } catch {
      setFormError("Something went wrong reverting the approval. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} title="Revert approval to draft" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-foreground">
          {documentName} will return to draft and be editable again. The approval and your reason
          stay on record.
        </p>
        <div>
          <label
            htmlFor={id}
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Reason
          </label>
          <textarea
            id={id}
            value={reason}
            rows={3}
            required
            aria-invalid={touched && !!reasonError}
            aria-describedby={touched && reasonError ? `${id}-err` : undefined}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
          {touched && reasonError && (
            <p id={`${id}-err`} className="mt-1 text-xs text-danger" role="alert">
              {reasonError}
            </p>
          )}
        </div>
        {formError && (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="text-xs" disabled={!parsed.success || pending}>
            {pending ? "Reverting…" : "Revert to draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
