"use client";

import { useState } from "react";
import type { EstimateBuildViewData } from "@/lib/estimateBuildViewData";
import { BuildEstimateInputForm } from "./BuildEstimateInputForm";
import {
  RoleResolutionReview,
  type PendingRoleResolutionView,
  type RateCardLineOption,
} from "./RoleResolutionReview";
import { EstimateReviewCard } from "./EstimateReviewCard";
import type { EstimateDocumentContent } from "@/types/estimates";

/**
 * Composes one Estimate track's whole build flow: add a role (extraction +
 * matching runs automatically as part of that submission — see
 * BuildEstimateInputForm) -> RoleResolutionReview while anything's pending
 * -> EstimateReviewCard once everything's resolved.
 *
 * Owns the whole workspace's state locally, seeded from the initial
 * `pendingResolutions`/`rateCardLines`/`reviewContent`/`latestVersion`
 * props — every nested action (add role, resolve one role, update a
 * quantity, save a version) reports its fresh EstimateBuildViewData result
 * back up via handleViewUpdate rather than relying on a page
 * revalidatePath/refresh to reach it. This is what lets the whole flow run
 * inside a modal (the "New estimate" flow) with no navigation at all, while
 * the standalone estimate page uses the exact same component the exact same
 * way, just seeded from a server-rendered initial view instead of an action
 * result.
 */
export function EstimateBuildWorkspace({
  projectId,
  estimateId,
  pendingResolutions: initialPendingResolutions,
  rateCardLines: initialRateCardLines,
  reviewContent: initialReviewContent,
  latestVersion: initialLatestVersion,
  embedded = false,
}: {
  projectId: string;
  estimateId: string;
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  reviewContent: EstimateDocumentContent | null;
  latestVersion: EstimateBuildViewData["latestVersion"];
  embedded?: boolean;
}) {
  const [pendingResolutions, setPendingResolutions] = useState(initialPendingResolutions);
  const [rateCardLines, setRateCardLines] = useState(initialRateCardLines);
  const [reviewContent, setReviewContent] = useState(initialReviewContent);
  const [latestVersion, setLatestVersion] = useState(initialLatestVersion);

  function handleViewUpdate(view: EstimateBuildViewData) {
    setPendingResolutions(view.pendingResolutions);
    setRateCardLines(view.rateCardLines);
    setReviewContent(view.reviewContent);
    setLatestVersion(view.latestVersion);
  }

  return (
    <div className="space-y-4">
      {latestVersion && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted p-3 text-xs">
          <span className="font-medium text-foreground">
            Latest saved: v{latestVersion.versionNumber}
          </span>
          <a
            href={`/api/projects/${projectId}/estimates/${estimateId}/versions/${latestVersion.id}`}
            className="font-medium text-primary hover:underline"
          >
            Download Word →
          </a>
          <a
            href={`/api/projects/${projectId}/estimates/${estimateId}/versions/${latestVersion.id}/xlsx`}
            className="font-medium text-primary hover:underline"
          >
            Download Excel →
          </a>
          {latestVersion.needsRecalculation && (
            <p role="status" className="basis-full font-medium text-warning">
              This version was calculated before units (hours, days, weeks) were converted to hours,
              so its fees may be wrong. It hasn&apos;t been changed — review the roles below and
              save a new version to recalculate.
            </p>
          )}
        </div>
      )}

      <BuildEstimateInputForm
        estimateId={estimateId}
        embedded={embedded}
        onSuccess={handleViewUpdate}
      />

      <RoleResolutionReview
        pendingResolutions={pendingResolutions}
        rateCardLines={rateCardLines}
        onResolved={handleViewUpdate}
      />

      {reviewContent && pendingResolutions.length === 0 && (
        <EstimateReviewCard
          projectId={projectId}
          estimateId={estimateId}
          content={reviewContent}
          onUpdated={handleViewUpdate}
          onSaved={handleViewUpdate}
        />
      )}
    </div>
  );
}
