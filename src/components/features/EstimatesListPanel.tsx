"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  createEstimateAction,
  type CreateEstimateActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { RateCardOption } from "@/app/(dashboard)/projects/new/actions";
import { EstimateBuildWorkspace } from "./EstimateBuildWorkspace";

export interface EstimateVersionListItem {
  id: string;
  versionNumber: number;
  createdAt: Date;
  totalValue: number;
  currency: string;
  description: string;
  /** Priced before unit conversion existed — left as saved, flagged for the PM. */
  needsRecalculation: boolean;
}

export interface EstimateListItem {
  id: string;
  label: string;
  /** Newest first. */
  versions: EstimateVersionListItem[];
}

/** Estimate tracks shown inline before the list defers to the "See more" modal. */
const MAX_VISIBLE_ESTIMATES = 3;

/** Matches Button's secondary variant, sized down for an inline link. */
const OPEN_LINK_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

interface CreatedEstimate {
  estimateId: string;
  label: string;
  rateCardLabel: string;
  view: NonNullable<CreateEstimateActionState["view"]>;
}

/**
 * "+ New estimate" opens a modal that drives the WHOLE build flow —
 * creation, capability-input capture, analyze & build, role resolution,
 * review, save and download — without ever navigating to the estimate's own
 * page. createEstimateAction returns the new estimate's id and its
 * (trivially empty) initial view instead of redirecting; once that
 * succeeds, the modal's content swaps from the label/rate-card form to an
 * embedded EstimateBuildWorkspace for that estimate. router.refresh() keeps
 * the estimates list behind the modal in sync (new local state on this
 * component isn't touched by it — only the Server Component's own props
 * are refreshed) so the new track is already there once the modal closes.
 */
function NewEstimateForm({
  projectId,
  rateCardOptions,
}: {
  projectId: string;
  rateCardOptions: RateCardOption[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [created, setCreated] = useState<CreatedEstimate | null>(null);

  async function submitAction(
    prevState: CreateEstimateActionState | undefined,
    formData: FormData
  ): Promise<CreateEstimateActionState> {
    const result = await createEstimateAction(projectId, prevState, formData);
    if (!result.message && result.estimateId && result.view) {
      setCreated({
        estimateId: result.estimateId,
        label: result.label ?? "Estimate",
        rateCardLabel: result.rateCardLabel ?? "",
        view: result.view,
      });
      router.refresh();
    }
    return result;
  }

  const [state, formAction, pending] = useActionState<
    CreateEstimateActionState | undefined,
    FormData
  >(submitAction, undefined);

  function closeModal() {
    setIsOpen(false);
    setCreated(null);
  }

  return (
    <>
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setIsOpen(true)}>
        + New estimate
      </Button>

      <Modal isOpen={isOpen} title={created ? created.label : "New estimate"} onClose={closeModal}>
        {created ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Locked to {created.rateCardLabel}</p>
            <EstimateBuildWorkspace
              projectId={projectId}
              estimateId={created.estimateId}
              pendingResolutions={created.view.pendingResolutions}
              rateCardLines={created.view.rateCardLines}
              reviewContent={created.view.reviewContent}
              latestVersion={created.view.latestVersion}
              embedded
            />
            <div className="flex justify-end border-t border-border pt-3">
              <Button type="button" variant="ghost" className="text-xs" onClick={closeModal}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-3">
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
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" className="text-xs" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="text-xs">
                {pending ? "Creating…" : "Create estimate"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/**
 * Kept deliberately compact — one line of identifying info plus a clearly
 * button-styled "Open" (continue building / add a new version, in the live
 * workspace) versus a separate, explicitly-labelled disclosure for
 * downloading any past saved version. The two are easy to conflate
 * ("Open" isn't "open a version," it's "open the estimate"), so the
 * disclosure's own summary text spells that difference out rather than
 * relying on visual position alone.
 */
function EstimateTrackCard({
  projectId,
  estimate,
}: {
  projectId: string;
  estimate: EstimateListItem;
}) {
  const latest = estimate.versions[0] as EstimateVersionListItem | undefined;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{estimate.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {latest
              ? `${formatDate(latest.createdAt)} · ${latest.description} · ${latest.totalValue.toFixed(2)} ${latest.currency}`
              : "No version saved yet"}
          </p>
          {latest?.needsRecalculation && (
            <p className="mt-0.5 text-xs font-medium text-warning">
              Needs recalculation — open and save a new version
            </p>
          )}
        </div>
        <a href={`/projects/${projectId}/estimates/${estimate.id}`} className={OPEN_LINK_CLASS}>
          Open →
        </a>
      </div>

      {estimate.versions.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Download a past version ({estimate.versions.length})
          </summary>
          <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5">
            {estimate.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
              >
                <span>
                  v{version.versionNumber} — {formatDate(version.createdAt)} ·{" "}
                  {version.totalValue.toFixed(2)} {version.currency}
                  {version.needsRecalculation && (
                    <span className="ml-1 font-medium text-warning">· needs recalculation</span>
                  )}
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
 * expandable access to full version history — plus "+ New estimate" (a
 * modal) to start another track locked to a client-scoped rate card
 * version. Only the MAX_VISIBLE_ESTIMATES most recent tracks render inline;
 * beyond that, a "See more estimates" link opens the full list in its own
 * modal, so a long-running project's history doesn't grow this step
 * indefinitely.
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
  const [showAllOpen, setShowAllOpen] = useState(false);
  const visibleEstimates = estimates.slice(0, MAX_VISIBLE_ESTIMATES);
  const hiddenCount = estimates.length - visibleEstimates.length;

  return (
    <div className="space-y-3">
      <NewEstimateForm projectId={projectId} rateCardOptions={rateCardOptions} />

      {estimates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates started yet.</p>
      ) : (
        <div className="space-y-2">
          {visibleEstimates.map((estimate) => (
            <EstimateTrackCard key={estimate.id} projectId={projectId} estimate={estimate} />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="text-xs"
          onClick={() => setShowAllOpen(true)}
        >
          See more estimates ({hiddenCount} more) →
        </Button>
      )}

      <Modal isOpen={showAllOpen} title="All estimates" onClose={() => setShowAllOpen(false)}>
        <div className="space-y-2">
          {estimates.map((estimate) => (
            <EstimateTrackCard key={estimate.id} projectId={projectId} estimate={estimate} />
          ))}
        </div>
      </Modal>
    </div>
  );
}
