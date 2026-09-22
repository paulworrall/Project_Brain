"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createEstimateAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { RateCardOption } from "@/app/(dashboard)/projects/new/actions";

export interface EstimateVersionListItem {
  id: string;
  versionNumber: number;
  createdAt: Date;
  totalValue: number;
  currency: string;
  description: string;
}

export interface EstimateListItem {
  id: string;
  label: string;
  /** Newest first. */
  versions: EstimateVersionListItem[];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function NewEstimateForm({
  projectId,
  rateCardOptions,
}: {
  projectId: string;
  rateCardOptions: RateCardOption[];
}) {
  const action = createEstimateAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setOpen(true)}>
        + New estimate
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-border bg-surface-muted p-3">
      <div>
        <label
          htmlFor="estimate-label"
          className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Label
        </label>
        <input
          id="estimate-label"
          name="label"
          required
          placeholder="e.g. Initial estimate"
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        />
      </div>
      <div>
        <label
          htmlFor="estimate-rate-card"
          className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Rate card
        </label>
        <select
          id="estimate-rate-card"
          name="rateCardVersionId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="" disabled>
            Choose a rate card version…
          </option>
          {rateCardOptions.map((card) =>
            card.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {card.name} — version {version.versionNumber}
                {version.status === "ENABLED" ? " (current)" : ""}
              </option>
            ))
          )}
        </select>
        {rateCardOptions.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            This client has no rate cards yet — upload one before starting an estimate.
          </p>
        )}
      </div>
      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="text-xs">
          {pending ? "Creating…" : "Create estimate"}
        </Button>
        <Button type="button" variant="ghost" className="text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EstimateTrackCard({ projectId, estimate }: { projectId: string; estimate: EstimateListItem }) {
  const latest = estimate.versions[0] as EstimateVersionListItem | undefined;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{estimate.label}</p>
          {latest ? (
            <>
              <p className="text-xs text-muted-foreground">
                {formatDate(latest.createdAt)} · {latest.description}
              </p>
              <p className="text-sm font-medium text-foreground">
                {latest.totalValue.toFixed(2)} {latest.currency}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No version saved yet.</p>
          )}
        </div>
        <a
          href={`/projects/${projectId}/estimates/${estimate.id}`}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Open →
        </a>
      </div>

      {estimate.versions.length > 0 && (
        <details className="mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            {estimate.versions.length === 1 ? "1 version" : `${estimate.versions.length} versions`}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {estimate.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
              >
                <span>
                  Version {version.versionNumber} — {formatDate(version.createdAt)} ·{" "}
                  {version.totalValue.toFixed(2)} {version.currency}
                </span>
                <a
                  href={`/api/projects/${projectId}/estimates/${estimate.id}/versions/${version.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  Download →
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/**
 * The real stage-6 content: every Estimate track for this project, newest
 * first, each showing its latest version's date/total/description with
 * expandable access to full version history — plus "+ New estimate" to
 * start another track locked to a client-scoped rate card version.
 */
export function EstimatesListPanel({
  projectId,
  estimates,
  rateCardOptions,
}: {
  projectId: string;
  estimates: EstimateListItem[];
  rateCardOptions: RateCardOption[];
}) {
  return (
    <div className="space-y-3">
      {estimates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates started yet.</p>
      ) : (
        <div className="space-y-3">
          {estimates.map((estimate) => (
            <EstimateTrackCard key={estimate.id} projectId={projectId} estimate={estimate} />
          ))}
        </div>
      )}
      <NewEstimateForm projectId={projectId} rateCardOptions={rateCardOptions} />
    </div>
  );
}
