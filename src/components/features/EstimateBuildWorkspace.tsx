"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import {
  ESTIMATE_ANALYSIS_PROCESSING_STAGES,
  ESTIMATE_ANALYSIS_STAGE_DURATIONS_MS,
} from "@/lib/estimateAnalysisProcessingStages";
import {
  analyzeAndBuildEstimateAction,
  type EstimateBuildActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { EstimateBuildViewData } from "@/lib/estimateBuildViewData";
import { BuildEstimateInputForm, type EstimateCapabilityInputView } from "./BuildEstimateInputForm";
import {
  RoleResolutionReview,
  type PendingRoleResolutionView,
  type RateCardLineOption,
} from "./RoleResolutionReview";
import { EstimateReviewCard } from "./EstimateReviewCard";
import type { EstimateDocumentContent } from "@/types/estimates";

/**
 * Composes one Estimate track's whole build flow: capability capture ->
 * "Analyze & build" (ProcessingOverlay-wired, same pattern as
 * CapabilitiesAndEstimateBriefPanel's "Get suggestions") -> RoleResolutionReview
 * while anything's pending -> EstimateReviewCard once everything's resolved.
 *
 * Owns the whole workspace's state locally, seeded from the initial
 * `existingInputs`/`pendingResolutions`/`rateCardLines`/`reviewContent`
 * props — every nested action (add/revise input, analyze & build, resolve
 * one role) reports its fresh EstimateBuildViewData result back up via
 * handleViewUpdate rather than relying on a page revalidatePath/refresh to
 * reach it. This is what lets the whole flow run inside a modal (the "New
 * estimate" flow) with no navigation at all, while the standalone estimate
 * page uses the exact same component the exact same way, just seeded from a
 * server-rendered initial view instead of an action result.
 */
export function EstimateBuildWorkspace({
  projectId,
  estimateId,
  existingInputs: initialExistingInputs,
  pendingResolutions: initialPendingResolutions,
  rateCardLines: initialRateCardLines,
  reviewContent: initialReviewContent,
  embedded = false,
}: {
  projectId: string;
  estimateId: string;
  existingInputs: EstimateCapabilityInputView[];
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  reviewContent: EstimateDocumentContent | null;
  embedded?: boolean;
}) {
  const [existingInputs, setExistingInputs] = useState(initialExistingInputs);
  const [pendingResolutions, setPendingResolutions] = useState(initialPendingResolutions);
  const [rateCardLines, setRateCardLines] = useState(initialRateCardLines);
  const [reviewContent, setReviewContent] = useState(initialReviewContent);

  function handleViewUpdate(view: EstimateBuildViewData) {
    setExistingInputs(view.existingInputs);
    setPendingResolutions(view.pendingResolutions);
    setRateCardLines(view.rateCardLines);
    setReviewContent(view.reviewContent);
  }

  const analyzeSubmitRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");
  const [pendingCountAfterAnalyze, setPendingCountAfterAnalyze] = useState<number | null>(null);

  // Same reasoning as CapabilitiesAndEstimateBriefPanel's suggestAction:
  // setState here, synchronously inside the action's own async function,
  // not in a useEffect keyed off a pending->settled transition.
  async function analyzeAction(
    prevState: EstimateBuildActionState | undefined,
    formData: FormData
  ): Promise<EstimateBuildActionState> {
    const result = await analyzeAndBuildEstimateAction(estimateId, prevState, formData);

    if (result.message) {
      setOverlayStatus("error");
      return result;
    }

    if (result.view) {
      handleViewUpdate(result.view);
      setPendingCountAfterAnalyze(result.view.pendingResolutions.length);
    }
    setOverlayStatus("success");
    return result;
  }

  const [analyzeState, analyzeFormAction, analyzePending] = useActionState<
    EstimateBuildActionState | undefined,
    FormData
  >(analyzeAction, undefined);

  const fallbackActive = overlayOpen && overlayStatus === "active";
  const { stageIndex, isFinalHold, elapsedInFinalHoldMs } = useFallbackStageProgress(
    fallbackActive,
    ESTIMATE_ANALYSIS_STAGE_DURATIONS_MS
  );

  useEffect(() => {
    if (overlayOpen && overlayStatus === "success") {
      const timeout = setTimeout(() => setOverlayOpen(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [overlayOpen, overlayStatus]);

  function handleAnalyzeSubmit() {
    setOverlayOpen(true);
    setOverlayStatus("active");
  }

  function handleRetryAnalyze() {
    analyzeSubmitRef.current?.click();
  }

  function handleDismissAnalyzeError() {
    setOverlayOpen(false);
  }

  const hasBeenAnalyzed = pendingResolutions.length > 0 || reviewContent !== null;
  const successMessage =
    pendingCountAfterAnalyze === null
      ? "Analysis complete."
      : pendingCountAfterAnalyze === 0
        ? "All roles resolved — review below."
        : `${pendingCountAfterAnalyze} role${pendingCountAfterAnalyze === 1 ? "" : "s"} need${
            pendingCountAfterAnalyze === 1 ? "s" : ""
          } your review.`;

  return (
    <div className="space-y-4">
      <BuildEstimateInputForm
        estimateId={estimateId}
        existingInputs={existingInputs}
        embedded={embedded}
        onSuccess={handleViewUpdate}
      />

      {existingInputs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted p-3">
          <form action={analyzeFormAction} onSubmit={handleAnalyzeSubmit}>
            <Button ref={analyzeSubmitRef} type="submit" disabled={analyzePending}>
              {analyzePending ? "Analyzing…" : hasBeenAnalyzed ? "Re-analyze" : "Analyze & build"}
            </Button>
          </form>
          <span className="text-xs text-muted-foreground">
            Matches each captured role against the rate card — re-run any time after adding or
            changing inputs.
          </span>
        </div>
      )}

      <RoleResolutionReview
        pendingResolutions={pendingResolutions}
        rateCardLines={rateCardLines}
        onResolved={handleViewUpdate}
      />

      {reviewContent && pendingResolutions.length === 0 && (
        <EstimateReviewCard projectId={projectId} estimateId={estimateId} content={reviewContent} />
      )}

      <ProcessingOverlay
        isOpen={overlayOpen}
        title="Analyzing capability inputs"
        stages={[...ESTIMATE_ANALYSIS_PROCESSING_STAGES]}
        stageIndex={stageIndex}
        status={overlayStatus}
        isFinalHold={isFinalHold}
        elapsedInFinalHoldMs={elapsedInFinalHoldMs}
        errorMessage={analyzeState?.message}
        successMessage={successMessage}
        onRetry={handleRetryAnalyze}
        onDismissError={handleDismissAnalyzeError}
      />
    </div>
  );
}
