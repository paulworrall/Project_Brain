"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import {
  ESTIMATE_ANALYSIS_PROCESSING_STAGES,
  ESTIMATE_ANALYSIS_STAGE_DURATIONS_MS,
} from "@/lib/estimateAnalysisProcessingStages";
import {
  addEstimateRoleInputAction,
  type EstimateBuildActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { EstimateBuildViewData } from "@/lib/estimateBuildViewData";

type InputMode = "paste" | "upload";

/**
 * Captures one raw batch of estimate content — paste or upload — and
 * immediately extracts + matches every role in it in the same submission
 * (no capability picker, no separate "Analyze & build" step — see
 * addEstimateRoleInputAction). Normally inside its own modal (a PM may add
 * several roles in one sitting, so a successful submission resets the form
 * rather than closing the modal). When `embedded` (rendered inside another
 * modal, e.g. the "New estimate" flow), it skips its own trigger button and
 * Modal wrapper and renders the form directly — nesting one modal inside
 * another is not something to do.
 *
 * Owns its own ProcessingOverlay, matching
 * CapabilitiesAndEstimateBriefPanel's "Get suggestions" self-contained
 * overlay pattern — this is what makes "add a role" feel like one explicit
 * step even though it now runs the whole extraction+matching pipeline.
 */
export function BuildEstimateInputForm({
  estimateId,
  embedded = false,
  onSuccess,
}: {
  estimateId: string;
  embedded?: boolean;
  onSuccess?: (view: EstimateBuildViewData) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<InputMode>("paste");
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");

  // Same reasoning as CapabilitiesAndEstimateBriefPanel's suggestAction:
  // report the fresh view and reset the form here, inside the action's own
  // async function once a submission actually succeeds — not in a
  // useEffect watching a pending->settled transition.
  async function submitAction(
    prevState: EstimateBuildActionState | undefined,
    formData: FormData
  ): Promise<EstimateBuildActionState> {
    const result = await addEstimateRoleInputAction(estimateId, prevState, formData);
    if (result.message) {
      setOverlayStatus("error");
      return result;
    }
    formRef.current?.reset();
    setMode("paste");
    if (result.view) {
      onSuccess?.(result.view);
    }
    setOverlayStatus("success");
    return result;
  }

  const [state, formAction, pending] = useActionState<EstimateBuildActionState | undefined, FormData>(
    submitAction,
    undefined
  );

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

  function handleSubmit() {
    setOverlayOpen(true);
    setOverlayStatus("active");
  }

  function handleRetry() {
    submitRef.current?.click();
  }

  function handleDismissError() {
    setOverlayOpen(false);
  }

  function closeModal() {
    setIsOpen(false);
  }

  const formContent = (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add as many team members to the project estimate as required. You can validate the role and
        levels once submitted.
      </p>

      <div className="flex gap-4 text-xs text-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="estimate-mode"
            checked={mode === "paste"}
            onChange={() => setMode("paste")}
          />
          Paste estimate
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="estimate-mode"
            checked={mode === "upload"}
            onChange={() => setMode("upload")}
          />
          Upload file
        </label>
      </div>

      {mode === "paste" ? (
        <textarea
          name="content"
          aria-label="Estimate"
          rows={6}
          placeholder="Paste the estimate content here…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        />
      ) : (
        <input
          name="file"
          type="file"
          aria-label="Estimate file"
          accept=".docx,.pdf,.pptx,.xlsx,.txt"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
      )}

      <Button ref={submitRef} type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add role"}
      </Button>
    </form>
  );

  const overlay = (
    <ProcessingOverlay
      isOpen={overlayOpen}
      title="Adding your role"
      stages={[...ESTIMATE_ANALYSIS_PROCESSING_STAGES]}
      stageIndex={stageIndex}
      status={overlayStatus}
      isFinalHold={isFinalHold}
      elapsedInFinalHoldMs={elapsedInFinalHoldMs}
      errorMessage={state?.message}
      successMessage="Role added — review below."
      onRetry={handleRetry}
      onDismissError={handleDismissError}
    />
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        {formContent}
        {overlay}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setIsOpen(true)}>
        + Add a new role
      </Button>

      <Modal isOpen={isOpen} title="Add a new role" onClose={closeModal}>
        <div className="space-y-4">
          {formContent}
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" variant="ghost" className="text-xs" onClick={closeModal}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
      {overlay}
    </div>
  );
}
