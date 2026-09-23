"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  saveEstimateVersionAction,
  updateRoleResolutionQuantityAction,
  type EstimateBuildActionState,
  type SaveEstimateVersionActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { EstimateBuildViewData } from "@/lib/estimateBuildViewData";
import type { EstimateDocumentContent } from "@/types/estimates";
import type { Capability } from "@/generated/prisma/enums";
import { ESTIMATE_UNIT_OPTIONS, formatQuantityWithHours } from "@/lib/estimateUnits";

const moneyFormat = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface FlatLineItem {
  capability: Capability;
  role: string;
  level: string | null;
  rateType: "HOURLY" | "DAILY" | "WEEKLY";
  rate: number;
  quantity: number;
  unit: string;
  hours?: number | null;
  feeSubtotal: number;
  roleResolutionId: string;
}

function EstimateReviewLineRow({
  row,
  onUpdated,
}: {
  row: FlatLineItem;
  onUpdated?: (view: EstimateBuildViewData) => void;
}) {
  // Same reasoning as RoleResolutionRow: report the fresh view here, inside
  // the action's own async function, once the update actually succeeds.
  async function submitAction(
    prevState: EstimateBuildActionState | undefined,
    formData: FormData
  ): Promise<EstimateBuildActionState> {
    const result = await updateRoleResolutionQuantityAction(
      row.roleResolutionId,
      prevState,
      formData
    );
    if (!result.message && result.view) {
      onUpdated?.(result.view);
    }
    return result;
  }

  const [state, formAction, pending] = useActionState<
    EstimateBuildActionState | undefined,
    FormData
  >(submitAction, undefined);

  return (
    <tr className="border-b border-border align-top text-foreground">
      <td className="py-1.5 pr-2">{capabilityLabel(row.capability)}</td>
      <td className="py-1.5 pr-2">{row.role}</td>
      <td className="py-1.5 pr-2">{row.level ?? "—"}</td>
      <td className="py-1.5 pr-2">
        <form action={formAction} className="flex flex-wrap items-center gap-1">
          <input
            type="number"
            name="quantity"
            step="0.01"
            min="0.01"
            defaultValue={row.quantity}
            aria-label={`Quantity for ${row.role}`}
            className="w-16 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
          <select
            name="unit"
            defaultValue={row.unit}
            aria-label={`Unit for ${row.role}`}
            className="rounded-md border border-border bg-surface px-1 py-0.5 text-xs text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            {ESTIMATE_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="ghost" className="px-2 py-0.5 text-xs" disabled={pending}>
            {pending ? "…" : "Update"}
          </Button>
        </form>
        <p className="mt-0.5 text-muted-foreground">
          {formatQuantityWithHours(row.quantity, row.unit, row.hours)}
        </p>
        {state?.message && (
          <p className="mt-0.5 text-xs text-danger" role="alert">
            {state.message}
          </p>
        )}
      </td>
      <td className="py-1.5 pr-2">
        {moneyFormat.format(row.rate)} / {row.rateType.toLowerCase()}
      </td>
      <td className="py-1.5 pr-2 tabular-nums">{moneyFormat.format(row.feeSubtotal)}</td>
    </tr>
  );
}

/**
 * The generated preview — generate -> review -> save -> download, matching
 * ClarificationEmailCard/DraftScopeDocumentCard. A fresh role added or
 * re-resolved one level up produces a fresh version of this content
 * automatically (no separate "Regenerate" control here). One flat table
 * across every resolved role — capability is a column, not a section
 * divider — with an inline quantity "Update" per row; role/level/rate stay
 * fixed since they come from the already-confirmed rate card match.
 */
export function EstimateReviewCard({
  projectId,
  estimateId,
  content,
  onUpdated,
  onSaved,
}: {
  projectId: string;
  estimateId: string;
  content: EstimateDocumentContent;
  onUpdated?: (view: EstimateBuildViewData) => void;
  onSaved?: (view: EstimateBuildViewData) => void;
}) {
  async function submitSave(
    prevState: SaveEstimateVersionActionState | undefined,
    formData: FormData
  ): Promise<SaveEstimateVersionActionState> {
    const result = await saveEstimateVersionAction(estimateId, prevState, formData);
    if (!result.message && result.view) {
      onSaved?.(result.view);
    }
    return result;
  }

  const [state, formAction, pending] = useActionState<
    SaveEstimateVersionActionState | undefined,
    FormData
  >(submitSave, undefined);

  const rows: FlatLineItem[] = content.capabilitySections.flatMap((section) =>
    section.lineItems.map((line) => ({ ...line, capability: section.capability }))
  );

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Review</h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-foreground sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Client</dt>
            <dd>{content.overview.clientName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd>{content.overview.projectName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project code</dt>
            <dd>{content.overview.projectCode ?? "Not yet set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Generated</dt>
            <dd>{content.overview.generatedDate}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Rate card</dt>
            <dd>
              {content.overview.rateCardName} (version {content.overview.rateCardVersionNumber})
            </dd>
          </div>
        </dl>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Capability</th>
              <th className="py-1.5 pr-2 font-medium">Role</th>
              <th className="py-1.5 pr-2 font-medium">Level</th>
              <th className="py-1.5 pr-2 font-medium">Quantity</th>
              <th className="py-1.5 pr-2 font-medium">Rate</th>
              <th className="py-1.5 pr-2 font-medium">Fee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EstimateReviewLineRow key={row.roleResolutionId} row={row} onUpdated={onUpdated} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Total: {moneyFormat.format(content.totalValue)} {content.currency}
          </p>
          {content.hoursPerDay != null && (
            <p className="text-xs text-muted-foreground">
              Fees are hours × hourly rate, at {content.hoursPerDay} hrs/day and{" "}
              {content.daysPerWeek} days/week.
            </p>
          )}
        </div>
        <form action={formAction}>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save as version"}
          </Button>
        </form>
      </div>

      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      {state?.versionId && (
        <p className="text-xs text-success" role="status">
          Saved.{" "}
          <a
            href={`/api/projects/${projectId}/estimates/${estimateId}/versions/${state.versionId}`}
            className="font-medium text-primary hover:underline"
          >
            Download .docx →
          </a>
        </p>
      )}
    </Card>
  );
}
