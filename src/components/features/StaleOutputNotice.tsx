"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { staleHeadline, type OutputFreshness } from "@/lib/freshness";
import type { ActionState } from "@/app/(dashboard)/projects/[projectId]/actions";

type RegenerateAction = (
  state: ActionState | undefined,
  formData: FormData
) => Promise<ActionState | undefined>;

/**
 * Shown on a generated output that no longer reflects the project, e.g.
 * "Built from v2 — v4 is available", with what changed and a one-click
 * Regenerate (a new version; the old one is kept). Outputs that come from
 * people's input (estimates, specialist review) are flagged only, with a hint
 * instead of a button. Renders nothing for an up-to-date output.
 */
export function StaleOutputNotice({
  freshness,
  regenerateAction,
  onRegenerate,
  flagOnlyHint,
}: {
  freshness: OutputFreshness | undefined;
  /** Bound to the project; required when the output can be regenerated. */
  regenerateAction?: RegenerateAction;
  /** Alternative to regenerateAction for outputs that open a review step first (the SOW): a plain click handler. */
  onRegenerate?: () => void;
  flagOnlyHint?: string;
}) {
  if (!freshness?.stale) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-foreground"
    >
      <div className="min-w-0">
        <p className="font-semibold">{staleHeadline(freshness)}</p>
        <p className="text-muted-foreground">{freshness.reasons.join(" · ")}</p>
        {!freshness.canRegenerate && flagOnlyHint && (
          <p className="mt-0.5 text-muted-foreground">{flagOnlyHint}</p>
        )}
      </div>
      {freshness.canRegenerate && onRegenerate && (
        <Button type="button" variant="secondary" className="shrink-0 text-xs" onClick={onRegenerate}>
          Regenerate
        </Button>
      )}
      {freshness.canRegenerate && !onRegenerate && regenerateAction && (
        <RegenerateButton action={regenerateAction} />
      )}
    </div>
  );
}

function RegenerateButton({ action }: { action: RegenerateAction }) {
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  return (
    <form action={formAction} className="shrink-0 text-right">
      <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
        {pending ? "Regenerating…" : "Regenerate"}
      </Button>
      {state?.message && (
        <p className="mt-1 max-w-56 text-danger" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
