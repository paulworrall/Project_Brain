"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import {
  SOW_GENERATION_PROCESSING_STAGES,
  SOW_GENERATION_STAGE_DURATIONS_MS,
} from "@/lib/sowGenerationProcessingStages";
import {
  startSowDevelopmentAction,
  generateSowAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface SowTemplateVersionSelectOption {
  id: string;
  versionNumber: number;
  fileName: string;
  status: "ENABLED" | "DISABLED";
}

export interface SowTemplateSelectOption {
  id: string;
  name: string;
  isBaseline: boolean;
  // Every version of this template, newest first — Rule 2 (audit gap):
  // versions don't supersede, so every one stays pickable, not just
  // whichever is flagged current.
  versions: SowTemplateVersionSelectOption[];
}

export interface SowVersionMeta {
  id: string;
  versionNumber: number;
  createdAt: Date;
}

function defaultVersionId(template: SowTemplateSelectOption | undefined): string {
  if (!template) return "";
  const flaggedCurrent = template.versions.find((v) => v.status === "ENABLED");
  return (flaggedCurrent ?? template.versions[0])?.id ?? "";
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

/**
 * Stage 8 — Commercials & SOW. Two steps: pick a SOW Template (the global
 * baseline plus only this Project's own Client's variants, scoped
 * server-side in getSOWTemplatesForClientAction), then "Generate SOW" —
 * which gathers everything already captured about the project and drafts a
 * real, downloadable .docx guided by the template's structure (never a
 * mail-merge — see sow-agent.ts). Regenerating always adds a new version,
 * never overwrites; every earlier version stays independently downloadable
 * via the "Download a past version" disclosure, mirroring
 * EstimatesListPanel's EstimateTrackCard pattern.
 */
export function StartSowDevelopmentPanel({
  projectId,
  currentTemplate,
  currentTemplateVersion,
  templateOptions,
  sowVersions,
}: {
  projectId: string;
  currentTemplate: { id: string; name: string } | null;
  currentTemplateVersion: { id: string } | null;
  templateOptions: SowTemplateSelectOption[];
  sowVersions: SowVersionMeta[];
}) {
  const action = startSowDevelopmentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(currentTemplate?.id ?? "");
  const selectedTemplate = templateOptions.find((t) => t.id === selectedTemplateId);
  // Pre-select the Project's own recorded version if it still belongs to
  // the currently-selected template; otherwise fall back to whichever
  // version is flagged current for that template.
  const [selectedVersionId, setSelectedVersionId] = useState(() => {
    if (currentTemplateVersion && selectedTemplate?.versions.some((v) => v.id === currentTemplateVersion.id)) {
      return currentTemplateVersion.id;
    }
    return defaultVersionId(selectedTemplate);
  });

  function handleTemplateChange(value: string) {
    setSelectedTemplateId(value);
    setSelectedVersionId(defaultVersionId(templateOptions.find((t) => t.id === value)));
  }

  // --- Generate SOW ------------------------------------------------------
  const generateSubmitRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");

  // Same reasoning as CapabilitiesAndEstimateBriefPanel's suggestAction:
  // setState here, synchronously inside the action's own async function,
  // not in a useEffect keyed off a pending->settled transition.
  async function generateAction(
    prevState: ActionState | undefined,
    formData: FormData
  ): Promise<ActionState | undefined> {
    const result = await generateSowAction(projectId, prevState, formData);
    setOverlayStatus(result?.message ? "error" : "success");
    return result;
  }

  const [generateState, generateFormAction, generatePending] = useActionState<
    ActionState | undefined,
    FormData
  >(generateAction, undefined);

  const fallbackActive = overlayOpen && overlayStatus === "active";
  const { stageIndex, isFinalHold, elapsedInFinalHoldMs } = useFallbackStageProgress(
    fallbackActive,
    SOW_GENERATION_STAGE_DURATIONS_MS
  );

  useEffect(() => {
    if (overlayOpen && overlayStatus === "success") {
      const timeout = setTimeout(() => setOverlayOpen(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [overlayOpen, overlayStatus]);

  function handleGenerateSubmit() {
    setOverlayOpen(true);
    setOverlayStatus("active");
  }

  function handleRetryGenerate() {
    generateSubmitRef.current?.click();
  }

  function handleDismissGenerateError() {
    setOverlayOpen(false);
  }

  const latestSowVersion = sowVersions[0];
  const olderSowVersions = sowVersions.slice(1);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor="sowTemplateId"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            SOW Template
          </label>
          <select
            id="sowTemplateId"
            name="sowTemplateId"
            value={selectedTemplateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Select a SOW Template…
            </option>
            {templateOptions.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isBaseline ? " (baseline)" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div>
            <label
              htmlFor="sowTemplateVersionId"
              className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Version
            </label>
            <select
              id="sowTemplateVersionId"
              name="sowTemplateVersionId"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            >
              <option value="" disabled>
                Select a version…
              </option>
              {selectedTemplate.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber} — {version.fileName}
                  {version.status === "ENABLED" ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {state?.message && (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : currentTemplate ? "Change SOW Template" : "Select SOW Template"}
        </Button>
      </form>

      {currentTemplate && (
        <p className="text-sm text-muted-foreground">
          Using <span className="font-medium text-foreground">{currentTemplate.name}</span>.
        </p>
      )}

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">Statement of Work</h4>
          <form action={generateFormAction} onSubmit={handleGenerateSubmit}>
            <Button
              ref={generateSubmitRef}
              type="submit"
              disabled={generatePending || !currentTemplate}
              className="text-xs"
            >
              {generatePending ? "Generating…" : latestSowVersion ? "Regenerate SOW" : "Generate SOW"}
            </Button>
          </form>
        </div>
        {!currentTemplate && (
          <p className="mt-1 text-xs text-muted-foreground">
            Select a SOW Template above before generating.
          </p>
        )}

        {latestSowVersion ? (
          <Card className="mt-3 space-y-1 p-4">
            <p className="text-sm font-medium text-foreground">
              Version {latestSowVersion.versionNumber} — {formatDateTime(latestSowVersion.createdAt)}
            </p>
            <a
              href={`/api/projects/${projectId}/sow/${latestSowVersion.id}`}
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              Download .docx →
            </a>

            {olderSowVersions.length > 0 && (
              <details className="mt-2 border-t border-border pt-2">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  Download a past version ({olderSowVersions.length})
                </summary>
                <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5">
                  {olderSowVersions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
                    >
                      <span>
                        v{version.versionNumber} — {formatDateTime(version.createdAt)}
                      </span>
                      <a
                        href={`/api/projects/${projectId}/sow/${version.id}`}
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
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No SOW generated yet.</p>
        )}
      </div>

      <ProcessingOverlay
        isOpen={overlayOpen}
        title="Generating the Statement of Work"
        stages={[...SOW_GENERATION_PROCESSING_STAGES]}
        stageIndex={stageIndex}
        status={overlayStatus}
        isFinalHold={isFinalHold}
        elapsedInFinalHoldMs={elapsedInFinalHoldMs}
        errorMessage={generateState?.message}
        successMessage="SOW generated — download it below."
        onRetry={handleRetryGenerate}
        onDismissError={handleDismissGenerateError}
      />
    </div>
  );
}
