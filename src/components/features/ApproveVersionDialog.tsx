"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/formatMoney";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  ApproveVersionSchema,
  fieldErrorsFrom,
  latestAllowedApprovalDate,
  type ActionResult,
  type CommercialDocumentTypeName,
} from "@/types/approvals";
import type { Capability } from "@/generated/prisma/enums";

export interface ApproveDialogSummary {
  name: string;
  versionNumber: number;
  /** Already formatted for display. */
  generatedDate: string;
  total: number | null;
  currency: string | null;
  /** Estimates only. */
  capabilities?: Capability[];
  /** SOWs only. */
  sourceEstimateVersionNumber?: number | null;
}

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records that the CLIENT approved a version outside the app — the wording says
 * so. One component for both documents. Confirm stays disabled until the form
 * is valid; messages are per field, never a generic "Invalid input".
 */
export function ApproveVersionDialog({
  isOpen,
  onClose,
  documentType,
  versionId,
  summary,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  documentType: CommercialDocumentTypeName;
  versionId: string;
  summary: ApproveDialogSummary;
  /** Resolves with the server result; the caller handles success (toast, focus, refresh). */
  onSubmit: (input: {
    versionId: string;
    clientApprovedOn: string;
    clientApproverName: string;
    reference?: string;
  }) => Promise<ActionResult<unknown>>;
}) {
  const ids = useId();
  const [clientApprovedOn, setDate] = useState(todayIso);
  const [clientApproverName, setName] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const noun = documentType === "ESTIMATE" ? "estimate" : "SOW";
  const parsed = ApproveVersionSchema.safeParse({
    versionId,
    clientApprovedOn,
    clientApproverName,
    reference: reference || undefined,
  });
  const clientErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
  const valid = parsed.success && confirmed;

  const errorFor = (field: string): string | undefined =>
    (touched[field] ? clientErrors[field] : undefined) ?? serverErrors[field];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ clientApprovedOn: true, clientApproverName: true, reference: true });
    if (!parsed.success || !confirmed || pending) return;
    setPending(true);
    setFormError(null);
    setServerErrors({});
    try {
      const result = await onSubmit(parsed.data);
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        setFormError(result.message);
      }
    } catch {
      setFormError("Something went wrong recording the approval. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} title={`Mark ${noun} as client approved`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md bg-surface-muted p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium text-foreground">{summary.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium text-foreground">v{summary.versionNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Generated</dt>
            <dd className="text-foreground">{summary.generatedDate}</dd>
          </div>
          {summary.total !== null && summary.currency && (
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-foreground">{formatMoney(summary.total, summary.currency)}</dd>
            </div>
          )}
          {summary.capabilities && summary.capabilities.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Capabilities</dt>
              <dd className="text-foreground">
                {summary.capabilities.map((c) => capabilityLabel(c)).join(", ")}
              </dd>
            </div>
          )}
          {summary.sourceEstimateVersionNumber != null && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Generated from</dt>
              <dd className="text-foreground">Estimate v{summary.sourceEstimateVersionNumber}</dd>
            </div>
          )}
        </dl>

        <p className="text-sm text-foreground">
          This records an approval the client gave outside Project Brain. Once approved, this
          version is locked.{" "}
          {documentType === "SOW"
            ? "You won't be able to regenerate the SOW."
            : "You won't be able to start a new estimate."}{" "}
          Changes will need a change request.
        </p>

        <div>
          <label htmlFor={`${ids}-date`} className={LABEL_CLASS}>
            Client approval date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={clientApprovedOn}
            max={latestAllowedApprovalDate()}
            required
            aria-invalid={!!errorFor("clientApprovedOn")}
            aria-describedby={errorFor("clientApprovedOn") ? `${ids}-date-err` : undefined}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, clientApprovedOn: true }))}
            className={INPUT_CLASS}
          />
          {errorFor("clientApprovedOn") && (
            <p id={`${ids}-date-err`} className="mt-1 text-xs text-danger" role="alert">
              {errorFor("clientApprovedOn")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${ids}-name`} className={LABEL_CLASS}>
            Approved by (client contact name)
          </label>
          <input
            id={`${ids}-name`}
            value={clientApproverName}
            required
            aria-invalid={!!errorFor("clientApproverName")}
            aria-describedby={errorFor("clientApproverName") ? `${ids}-name-err` : undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, clientApproverName: true }))}
            className={INPUT_CLASS}
          />
          {errorFor("clientApproverName") && (
            <p id={`${ids}-name-err`} className="mt-1 text-xs text-danger" role="alert">
              {errorFor("clientApproverName")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${ids}-ref`} className={LABEL_CLASS}>
            Reference / note (optional)
          </label>
          <input
            id={`${ids}-ref`}
            value={reference}
            placeholder="e.g. PO number or email subject"
            aria-invalid={!!errorFor("reference")}
            aria-describedby={errorFor("reference") ? `${ids}-ref-err` : undefined}
            onChange={(e) => setReference(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, reference: true }))}
            className={INPUT_CLASS}
          />
          {errorFor("reference") && (
            <p id={`${ids}-ref-err`} className="mt-1 text-xs text-danger" role="alert">
              {errorFor("reference")}
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>I confirm the client has approved this exact version</span>
        </label>

        {formError && (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="text-xs" disabled={!valid || pending}>
            {pending ? "Recording…" : "Confirm approval"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
