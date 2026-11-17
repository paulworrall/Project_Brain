"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  PROJECT_STEPS,
  STEP_STATUS_LABEL,
  stepAccessibleName,
  type StepId,
  type StepStatus,
  type StepSummary,
} from "@/lib/projectSteps";
import { StatusIcon, type StatusBadgeState } from "@/components/ui/StatusBadge";

/** Step status as the shared badge's icon states. */
const STEP_BADGE_STATE: Record<StepStatus, StatusBadgeState> = {
  not_started: "not_started",
  in_progress: "in_progress",
  done: "done",
};

/** Status as icon + text — never colour alone (the shared badge's icons, without the pill). */
export function StepStatusIcon({ status }: { status: StepStatus }) {
  return <StatusIcon state={STEP_BADGE_STATE[status]} />;
}

/**
 * The status line under a step name: the done summary ("Approved 19 Oct · v2"),
 * "You are here" for the step being shown, "Needs review" when something in it
 * needs attention, "Up next" for the next step to do, otherwise the plain
 * status. Pure so it can be tested on its own.
 */
export function stepStatusLine(opts: {
  status: StepStatus;
  isActive: boolean;
  isNext: boolean;
  summary?: StepSummary;
  attention?: string;
}): { state: StatusBadgeState; text: string } {
  const { status, isActive, isNext, summary, attention } = opts;
  if (attention) return { state: "needs_review", text: "Needs review" };
  if (status === "done") return { state: "done", text: summary ? summary.text : STEP_STATUS_LABEL.done };
  if (isActive) return { state: "in_progress", text: "You are here" };
  if (status === "in_progress") return { state: "in_progress", text: STEP_STATUS_LABEL.in_progress };
  if (isNext) return { state: "not_started", text: "Up next" };
  return { state: "not_started", text: STEP_STATUS_LABEL.not_started };
}

/**
 * The SOW journey stepper (FB-008, restyled in FB-012): three equal segments
 * across the content width with a connector between them — 36px circles, 18px
 * names, 14px status lines. Each step is a real link (the URL carries the
 * step), so it's a labelled nav with aria-current, not role="tablist". No step
 * is locked. A done Estimate/SOW also offers its approved file — as a sibling
 * link, since links can't nest. The Next step banner sits directly under it in
 * the same bordered container (ProjectShell).
 */
export function ProjectStepper({
  projectId,
  statuses,
  summaries,
  activeStepId,
  attention = {},
}: {
  projectId: string;
  statuses: Record<StepId, StepStatus>;
  summaries: Partial<Record<StepId, StepSummary>>;
  activeStepId: StepId | null;
  /** Something in a step needs the PM's attention (e.g. "Updated since SOW"), in words. */
  attention?: Partial<Record<StepId, string>>;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  // The next step to do: the first that isn't done.
  const nextId = PROJECT_STEPS.find((s) => statuses[s.id] !== "done")?.id ?? null;

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activeStepId]);

  return (
    <nav aria-label="Project steps" className="min-w-0">
      <ol className="grid grid-cols-3">
        {PROJECT_STEPS.map((step, index) => {
          const status = statuses[step.id];
          const summary = status === "done" ? summaries[step.id] : undefined;
          const isActive = step.id === activeStepId;
          const line = stepStatusLine({
            status,
            isActive,
            isNext: step.id === nextId,
            summary,
            attention: attention[step.id],
          });
          const needsReview = line.state === "needs_review";
          return (
            <li key={step.id} className="relative min-w-0">
              <Link
                ref={isActive ? activeRef : undefined}
                href={`/projects/${projectId}/${step.slug}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${stepAccessibleName(step, status, summary)}${attention[step.id] ? `, needs attention: ${attention[step.id]}` : ""}`}
                // Current step: Navy ring on the circle plus a 3px Orange underline (a non-text
                // accent alongside the word "You are here").
                className={`group flex h-full min-h-11 cursor-pointer flex-col items-start gap-2 border-b-[3px] px-3 py-3 text-left focus-inset motion-safe:transition-colors sm:flex-row sm:items-start sm:gap-3 ${
                  isActive ? "border-orange bg-surface" : "border-transparent hover:bg-line-soft"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-medium ${
                    status === "done"
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "border-2 border-primary bg-surface text-primary"
                        : "border border-border-strong bg-surface text-muted-foreground"
                  }`}
                >
                  {status === "done" ? (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M5.5 12.5l4.2 4.2 8.8-9.2"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    step.order
                  )}
                  {needsReview && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rag-amber text-navy">
                      <StatusIcon state="needs_review" />
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-card font-medium text-foreground">{step.label}</span>
                  <span className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="mt-0.5">
                      <StatusIcon state={line.state} />
                    </span>
                    <span>
                      {line.text}
                      {attention[step.id] && (
                        <span className="sr-only">: {attention[step.id]}</span>
                      )}
                    </span>
                  </span>
                </span>
              </Link>
              {summary?.downloadHref && (
                <a
                  href={summary.downloadHref}
                  className="mb-2 ml-3 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline sm:ml-[3.75rem]"
                >
                  {summary.downloadLabel ?? "Download"}
                </a>
              )}
              {index < PROJECT_STEPS.length - 1 && (
                // The connector sits on the boundary between segments, level with the circles;
                // filled Navy once the step before it is done.
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-[1.875rem] right-0 hidden h-0.5 w-6 translate-x-1/2 sm:block ${
                    status === "done" ? "bg-primary" : "bg-border-strong"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
