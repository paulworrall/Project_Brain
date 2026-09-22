"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  resolveRoleResolutionAction,
  type EstimateBuildActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { EstimateBuildViewData } from "@/lib/estimateBuildViewData";
import type { Capability } from "@/generated/prisma/enums";

export interface RateCardLineOption {
  id: string;
  role: string;
  level: string | null;
  rateType: "HOURLY" | "DAILY" | "WEEKLY";
  rate: number;
  currency: string;
}

export interface PendingRoleResolutionView {
  id: string;
  capability: Capability;
  rawRoleText: string;
  extractedRole: string;
  extractedLevel: string | null;
  extractedQuantity: number;
  extractedUnit: string;
  matchType: "NO_MATCH" | "ROLE_ONLY" | "ROLE_AND_LEVEL";
  confidence: number;
  suggestedLine: RateCardLineOption | null;
}

function lineLabel(line: RateCardLineOption): string {
  return `${line.role}${line.level ? `, ${line.level}` : ""} — ${line.rate} ${line.currency}/${line.rateType.toLowerCase()}`;
}

function RoleResolutionRow({
  resolution,
  rateCardLines,
  onResolved,
}: {
  resolution: PendingRoleResolutionView;
  rateCardLines: RateCardLineOption[];
  onResolved?: (view: EstimateBuildViewData) => void;
}) {
  // Same reasoning as BuildEstimateInputForm's submitAction: report the
  // fresh view here, inside the action's own async function, once the
  // resolve actually succeeds — not in a useEffect watching pending->settled.
  async function submitAction(
    prevState: EstimateBuildActionState | undefined,
    formData: FormData
  ): Promise<EstimateBuildActionState> {
    const result = await resolveRoleResolutionAction(resolution.id, prevState, formData);
    if (!result.message && result.view) {
      onResolved?.(result.view);
    }
    return result;
  }

  const [state, formAction, pending] = useActionState<EstimateBuildActionState | undefined, FormData>(
    submitAction,
    undefined
  );

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-foreground">
          {capabilityLabel(resolution.capability)}
        </span>
        <span className="text-muted-foreground">&quot;{resolution.rawRoleText}&quot;</span>
      </div>
      <p className="mt-1.5 text-sm text-foreground">
        Extracted: <span className="font-medium">{resolution.extractedRole}</span>
        {resolution.extractedLevel ? `, ${resolution.extractedLevel}` : " — no level stated"} ·{" "}
        {resolution.extractedQuantity} {resolution.extractedUnit}
      </p>
      {resolution.suggestedLine && (
        <p className="mt-1 text-xs text-muted-foreground">
          Suggested, not applied: {lineLabel(resolution.suggestedLine)} — confidence{" "}
          {Math.round(resolution.confidence * 100)}%
        </p>
      )}

      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor={`line-${resolution.id}`}
            className="block text-xs font-medium text-muted-foreground"
          >
            Rate card line
          </label>
          <select
            id={`line-${resolution.id}`}
            name="rateCardLineItemId"
            defaultValue={resolution.suggestedLine?.id ?? ""}
            required
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Choose a line…
            </option>
            {rateCardLines.map((line) => (
              <option key={line.id} value={line.id}>
                {lineLabel(line)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
          {pending ? "Confirming…" : "Confirm"}
        </Button>
      </form>
      {state?.message && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
    </li>
  );
}

/**
 * Its own reviewable state, not folded silently into the results — one row
 * per role the matching agent couldn't confidently resolve alone (role-only
 * or low-confidence). The agent's suggestion, if any, is clearly labelled
 * as a suggestion; the PM always explicitly confirms or overrides via the
 * dropdown before saveEstimateVersionAction will allow a save.
 */
export function RoleResolutionReview({
  pendingResolutions,
  rateCardLines,
  onResolved,
}: {
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  onResolved?: (view: EstimateBuildViewData) => void;
}) {
  if (pendingResolutions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md border border-warning bg-warning-bg p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {pendingResolutions.length} role{pendingResolutions.length === 1 ? "" : "s"} need
          {pendingResolutions.length === 1 ? "s" : ""} your review
        </h4>
        <p className="text-xs text-muted-foreground">
          These weren&apos;t confidently matched to one specific rate card line — confirm or choose
          the correct line for each before the estimate can be saved.
        </p>
      </div>
      <ul className="space-y-3">
        {pendingResolutions.map((resolution) => (
          <RoleResolutionRow
            key={resolution.id}
            resolution={resolution}
            rateCardLines={rateCardLines}
            onResolved={onResolved}
          />
        ))}
      </ul>
    </div>
  );
}
