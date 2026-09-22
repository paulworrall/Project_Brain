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
  type AnalyzeAndBuildActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
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
 */
export function EstimateBuildWorkspace({
  projectId,
  estimateId,
  existingInputs,
  pendingResolutions,
  rateCardLines,
  reviewContent,
}: {
  projectId: string;
  estimateId: string;
  existingInputs: EstimateCapabilityInputView[];
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  reviewContent: EstimateDocumentContent | null;
}) {
  const analyzeSubmitRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");
  const [pendingCountAfterAnalyze, setPendingCountAfterAnalyze] = useState<number | null>(null);

  // Same reasoning as CapabilitiesAndEstimateBriefPanel's suggestAction:
  // setState here, synchronously inside the action's own async function,
  // not in a useEffect keyed off a pending->settled transition.
  async function analyzeAction(
    prevState: AnalyzeAndBuildActionState | undefined,
    formData: FormData
  ): Promise<AnalyzeAndBuildActionState> {
    const result = await analyzeAndBuildEstimateAction(estimateId, prevState, formData);

    if (result.message) {
      setOverlayStatus("error");
      return result;
    }

    setPendingCountAfterAnalyze(result.pendingCount ?? null);
    setOverlayStatus("success");
    return result;
  }

  const [analyzeState, analyzeFormAction, analyzePending] = useActionState<
    AnalyzeAndBuildActionState | undefined,
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
      <BuildEstimateInputForm estimateId={estimateId} existingInputs={existingInputs} />

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

      <RoleResolutionReview pendingResolutions={pendingResolutions} rateCardLines={rateCardLines} />

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
