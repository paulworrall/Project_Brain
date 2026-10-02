"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { sowSyncBannerText, type SowSyncStatus } from "@/lib/sowSyncView";
import {
  confirmSowEstimateSourceAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface EstimateVersionOption {
  estimateVersionId: string;
  /** e.g. "Main v3 — 93,000 USD" */
  label: string;
}

/**
 * The SOW card's estimate-sync message, read from getSowSyncStatus.
 * Stale: a persistent "Out of date" badge and the diff, in words (never
 * colour alone). Unlinked: a softer prompt to confirm which estimate version
 * the SOW reflects, or to regenerate it. In sync: nothing. Lives in a polite
 * live region so a change is announced. `action` is the primary "Update
 * SOW" control, supplied by the panel.
 */
export function SowSyncNotice({
  projectId,
  sync,
  estimateVersionOptions,
  action,
}: {
  projectId: string;
  sync: SowSyncStatus | null | undefined;
  estimateVersionOptions: EstimateVersionOption[];
  action?: React.ReactNode;
}) {
  if (!sync || sync.status === "in_sync") return null;

  if (sync.status === "stale") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-2 rounded-md border border-warning bg-warning-bg p-3 text-xs text-foreground"
      >
        <span className="inline-block rounded-full border border-warning bg-surface px-2 py-0.5 text-xs font-semibold text-warning">
          Out of date
        </span>
        <p>{sowSyncBannerText(sync)}</p>
        {action}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2 rounded-md border border-border bg-surface-muted p-3 text-xs text-foreground"
    >
      <p>
        We don&apos;t know which estimate version SOW v{sync.sowVersionNumber} reflects — it was made
        before this was recorded. Confirm it below, or regenerate the SOW.
      </p>
      <ConfirmSourceForm
        projectId={projectId}
        sowVersionId={sync.sowVersionId}
        options={estimateVersionOptions}
      />
    </div>
  );
}

function ConfirmSourceForm({
  projectId,
  sowVersionId,
  options,
}: {
  projectId: string;
  sowVersionId: string;
  options: EstimateVersionOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    confirmSowEstimateSourceAction.bind(null, projectId, sowVersionId),
    undefined
  );
  if (options.length === 0) {
    return <p className="text-muted-foreground">There are no saved estimate versions to choose from.</p>;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <span>Estimate version</span>
        <select
          name="estimateVersionId"
          defaultValue={options[0]?.estimateVersionId}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          {options.map((o) => (
            <option key={o.estimateVersionId} value={o.estimateVersionId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      {state?.message && (
        <p className="basis-full text-danger" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
