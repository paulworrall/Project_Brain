"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export type ProcessingOverlayStatus = "active" | "error" | "success";

export interface ProcessingOverlayProps {
  isOpen: boolean;
  /** Dialog heading, e.g. "Setting up your project". */
  title: string;
  /** Ordered stage labels, e.g. ["Reading your brief", "Classifying workstream", ...]. */
  stages: string[];
  /** Index into `stages` for the current stage. Caller-driven — a fallback timer today, a real event stream later. */
  stageIndex: number;
  status: ProcessingOverlayStatus;
  /** True once the process has run past its expected pacing and is still going. */
  isFinalHold?: boolean;
  elapsedInFinalHoldMs?: number;
  /** Shown in the error state; falls back to a generic message if omitted. */
  errorMessage?: string;
  /** Success-state heading/body, shown briefly before the caller dismisses the overlay. */
  successMessage?: string;
  onRetry?: () => void;
  onDismissError?: () => void;
}

function formatElapsed(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

export function ProcessingOverlay({
  isOpen,
  title,
  stages,
  stageIndex,
  status,
  isFinalHold = false,
  elapsedInFinalHoldMs = 0,
  errorMessage,
  successMessage,
  onRetry,
  onDismissError,
}: ProcessingOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const prevStatusRef = useRef(status);

  useFocusTrap(containerRef, isOpen);

  useEffect(() => {
    if (isOpen && prevStatusRef.current !== status) {
      containerRef.current?.focus();
    }
    prevStatusRef.current = status;
  }, [status, isOpen]);

  useEffect(() => {
    if (!isOpen || status !== "error") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismissError?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, status, onDismissError]);

  if (!isOpen) return null;

  const clampedIndex = Math.min(Math.max(stageIndex, 0), Math.max(stages.length - 1, 0));
  const currentStageLabel = stages[clampedIndex];

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="processing-overlay"
      data-reduced-motion={prefersReducedMotion}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm outline-none"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-lg">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {title}
        </h2>

        {status === "error" ? (
          <div className="mt-6">
            <p className="text-sm font-medium text-danger" role="alert">
              Something went wrong
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage ?? "Check the highlighted fields below and try again."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              {onDismissError && (
                <Button type="button" variant="secondary" onClick={onDismissError}>
                  Close
                </Button>
              )}
              {onRetry && (
                <Button type="button" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        ) : status === "success" ? (
          <div className="mt-6">
            <p className="text-sm font-medium text-success" role="status">
              {successMessage ?? "All set."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex justify-center" aria-hidden="true">
              {prefersReducedMotion ? (
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              ) : (
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="thinking-dot h-2.5 w-2.5 rounded-full bg-primary"
                      style={{ animationDelay: `${dot * 160}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>

            <ol className="mt-6 space-y-2" aria-hidden="true">
              {stages.map((stage, index) => (
                <li
                  key={stage}
                  className={`flex items-center gap-2 text-sm ${
                    index < clampedIndex
                      ? "text-muted-foreground line-through"
                      : index === clampedIndex
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/60"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      index <= clampedIndex ? "bg-primary" : "bg-border"
                    }`}
                  />
                  {stage}
                </li>
              ))}
            </ol>

            <p role="status" aria-live="polite" className="sr-only">
              {currentStageLabel}
              {isFinalHold ? ` — still working, ${formatElapsed(elapsedInFinalHoldMs)} elapsed` : ""}
            </p>

            {isFinalHold && (
              <p
                data-testid="stage-elapsed-hint"
                className="mt-4 text-center text-xs text-muted-foreground"
              >
                Still working — {formatElapsed(elapsedInFinalHoldMs)} elapsed. Larger briefs can take a
                little longer.
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
