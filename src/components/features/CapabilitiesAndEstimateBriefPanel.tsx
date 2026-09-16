"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import {
  CAPABILITY_SUGGESTION_PROCESSING_STAGES,
  CAPABILITY_SUGGESTION_STAGE_DURATIONS_MS,
} from "@/lib/capabilitySuggestionProcessingStages";
import { MAP_CAPABILITIES } from "@/lib/mapCapabilities";
import type { Capability } from "@/generated/prisma/enums";
import {
  suggestCapabilitiesAction,
  updateConfirmedCapabilitiesAction,
  generateEstimateBriefAction,
  type ActionState,
  type CapabilitySuggestionActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface EstimateBriefVersionMeta {
  id: string;
  versionNumber: number;
  createdAt: Date;
  capabilities: Capability[];
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Order-independent comparison — a re-save in a different order isn't a real change. */
function sameCapabilitySet(a: Capability[], b: Capability[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((c) => bSet.has(c));
}

/**
 * End-of-Phase-1 panel: which MAP capability teams to approach for
 * estimates, plus generating a downloadable brief for them. Additive —
 * never gates Stage 2. Mirrors the generate -> review -> Regenerate ->
 * download pattern from ClarificationEmailCard/DraftScopeDocumentCard for
 * the brief, and reuses ProcessingOverlay for the (optional) AI suggestion
 * call, same as NewProjectForm's intake flow.
 */
export function CapabilitiesAndEstimateBriefPanel({
  projectId,
  confirmedCapabilities,
  estimateBriefVersion,
}: {
  projectId: string;
  confirmedCapabilities: Capability[];
  estimateBriefVersion: EstimateBriefVersionMeta | null;
}) {
  const [checked, setChecked] = useState<Set<Capability>>(new Set(confirmedCapabilities));
  const [rationaleByCapability, setRationaleByCapability] = useState<Partial<Record<Capability, string>>>(
    {}
  );
  const [lowConfidenceReason, setLowConfidenceReason] = useState<string | null>(null);

  function toggleCapability(capability: Capability) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(capability)) {
        next.delete(capability);
      } else {
        next.add(capability);
      }
      return next;
    });
  }

  // --- "Not sure? Get suggestions" -----------------------------------
  const suggestSubmitRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");

  // Applies the agent's result as soon as the action itself resolves,
  // rather than deriving it in a useEffect keyed off a pending->settled
  // transition — an effect that only exists to react to an action finishing
  // is exactly the "setState synchronously in an effect" anti-pattern
  // (react-hooks/set-state-in-effect); calling setState here, inside the
  // action that's actually doing the async work, is the recommended fix.
  async function suggestAction(
    prevState: CapabilitySuggestionActionState | undefined,
    formData: FormData
  ): Promise<CapabilitySuggestionActionState> {
    const result = await suggestCapabilitiesAction(projectId, prevState, formData);

    if (result.message) {
      setOverlayStatus("error");
      return result;
    }

    setChecked((prev) => {
      const next = new Set(prev);
      for (const suggestion of result.suggestions ?? []) {
        next.add(suggestion.capability);
      }
      return next;
    });
    setRationaleByCapability((prev) => {
      const next = { ...prev };
      for (const suggestion of result.suggestions ?? []) {
        next[suggestion.capability] = suggestion.rationale;
      }
      return next;
    });
    setLowConfidenceReason(
      result.isLowConfidence ? result.lowConfidenceReason ?? "Limited brief content available." : null
    );
    setOverlayStatus("success");
    return result;
  }

  const [suggestState, suggestFormAction, suggestPending] = useActionState<
    CapabilitySuggestionActionState | undefined,
    FormData
  >(suggestAction, undefined);

  const fallbackActive = overlayOpen && overlayStatus === "active";
  // CAPABILITY_SUGGESTION_STAGE_DURATIONS_MS must be passed by its stable
  // module-level reference, not a fresh copy — useFallbackStageProgress
  // depends on it in an effect, and a new array identity every render
  // retriggers that effect every render (tick -> setState -> re-render ->
  // new array -> effect retrigger), an infinite loop the moment the overlay
  // opens.
  const { stageIndex, isFinalHold, elapsedInFinalHoldMs } = useFallbackStageProgress(
    fallbackActive,
    CAPABILITY_SUGGESTION_STAGE_DURATIONS_MS
  );

  useEffect(() => {
    if (overlayOpen && overlayStatus === "success") {
      const timeout = setTimeout(() => setOverlayOpen(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [overlayOpen, overlayStatus]);

  function handleSuggestSubmit() {
    setOverlayOpen(true);
    setOverlayStatus("active");
  }

  function handleRetrySuggest() {
    suggestSubmitRef.current?.click();
  }

  function handleDismissSuggestError() {
    setOverlayOpen(false);
  }

  // --- Save confirmed capabilities ------------------------------------
  const saveAction = updateConfirmedCapabilitiesAction.bind(null, projectId);
  const [saveState, saveFormAction, savePending] = useActionState<ActionState | undefined, FormData>(
    saveAction,
    undefined
  );

  // --- Prepare the estimate brief --------------------------------------
  const generateAction = generateEstimateBriefAction.bind(null, projectId);
  const [generateState, generateFormAction, generatePending] = useActionState<
    ActionState | undefined,
    FormData
  >(generateAction, undefined);

  const isStale =
    estimateBriefVersion !== null &&
    !sameCapabilitySet(estimateBriefVersion.capabilities, confirmedCapabilities);

  return (
    <Card className="space-y-5 p-5">
      <h3 className="text-sm font-semibold text-foreground">Capabilities & Estimate Brief</h3>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">Confirmed capabilities</h4>
          <form action={suggestFormAction} onSubmit={handleSuggestSubmit}>
            <Button
              ref={suggestSubmitRef}
              type="submit"
              variant="ghost"
              className="text-xs"
              disabled={suggestPending}
            >
              {suggestPending ? "Thinking…" : "Not sure? Get suggestions"}
            </Button>
          </form>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Which MAP capability teams should be approached for estimates on this project — editable
          at any time.
        </p>

        {lowConfidenceReason && (
          <p className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning" role="status">
            Low confidence: {lowConfidenceReason} Treat these suggestions as a starting point, not
            certainties.
          </p>
        )}

        <form action={saveFormAction} className="mt-3 space-y-3">
          <ul className="space-y-2">
            {MAP_CAPABILITIES.map((capability) => (
              <li key={capability.id}>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={capability.id}
                    checked={checked.has(capability.id)}
                    onChange={() => toggleCapability(capability.id)}
                    className="mt-0.5"
                  />
                  <span>
                    {capability.label}
                    {checked.has(capability.id) && rationaleByCapability[capability.id] && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {rationaleByCapability[capability.id]}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {saveState?.message && (
            <p className="text-xs text-danger" role="alert">
              {saveState.message}
            </p>
          )}
          <Button type="submit" variant="secondary" className="text-xs" disabled={savePending}>
            {savePending ? "Saving…" : "Save confirmed capabilities"}
          </Button>
        </form>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">Estimate brief</h4>
          <form action={generateFormAction}>
            <Button
              type="submit"
              variant="secondary"
              className="text-xs"
              disabled={generatePending || confirmedCapabilities.length === 0}
            >
              {generatePending
                ? "Preparing…"
                : estimateBriefVersion
                  ? "Regenerate"
                  : "Prepare the estimate brief"}
            </Button>
          </form>
        </div>
        {confirmedCapabilities.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Confirm at least one capability above before preparing the brief.
          </p>
        )}
        {generateState?.message && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {generateState.message}
          </p>
        )}

        {estimateBriefVersion ? (
          <Card className="mt-3 space-y-1 p-4">
            <p className="text-sm font-medium text-foreground">
              Version {estimateBriefVersion.versionNumber} — {formatDateTime(estimateBriefVersion.createdAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {estimateBriefVersion.capabilities.length} capability sections
            </p>
            <a
              href={`/api/projects/${projectId}/estimate-brief/${estimateBriefVersion.id}`}
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              Download .docx →
            </a>
            {isStale && (
              <p className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning" role="status">
                Capabilities have changed since this was generated — regenerate to bring it up to
                date.
              </p>
            )}
          </Card>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No estimate brief generated yet.</p>
        )}
      </div>

      <ProcessingOverlay
        isOpen={overlayOpen}
        title="Suggesting capabilities"
        stages={[...CAPABILITY_SUGGESTION_PROCESSING_STAGES]}
        stageIndex={stageIndex}
        status={overlayStatus}
        isFinalHold={isFinalHold}
        elapsedInFinalHoldMs={elapsedInFinalHoldMs}
        errorMessage={suggestState?.message}
        successMessage="Suggestions added below — review and save."
        onRetry={handleRetrySuggest}
        onDismissError={handleDismissSuggestError}
      />
    </Card>
  );
}
