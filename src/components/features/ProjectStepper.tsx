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

/** Status as icon + text — never colour alone. Done is Navy with a tick. */
export function StepStatusIcon({ status }: { status: StepStatus }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      {status === "done" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" className="text-primary" />
          <path
            d="M4.5 8.2l2.3 2.3 4.7-4.9"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : status === "in_progress" ? (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-primary"
          />
          <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" className="text-primary" />
        </>
      ) : (
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/**
 * The SOW journey stepper (FB-008): 1 Brief · 2 Estimate · 3 SOW. Re-purposes
 * FB-007's phase tab bar — same hover/pressed/focus/selected states, 44px
 * targets and connectors. Each step is a real link (the URL carries the step),
 * so it's a labelled nav with aria-current, not role="tablist". No step is
 * locked. A done Estimate/SOW also offers its approved file — as a sibling
 * link, since links can't nest.
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

  useEffect(() => {
    // Narrow screens scroll the bar horizontally — keep the active step visible.
    activeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activeStepId]);

  return (
    <nav aria-label="Project steps" className="min-w-0 flex-1 overflow-x-auto">
      <ol className="flex min-w-max items-stretch">
        {PROJECT_STEPS.map((step, index) => {
          const status = statuses[step.id];
          const summary = status === "done" ? summaries[step.id] : undefined;
          const isActive = step.id === activeStepId;
          return (
            <li key={step.id} className="flex items-stretch">
              {index > 0 && (
                // Centred on the label line; not part of either step's hit area.
                <span
                  aria-hidden="true"
                  className="mt-[22px] h-px w-4 shrink-0 self-start bg-border sm:w-8"
                />
              )}
              <div className="flex flex-col">
                <Link
                  ref={isActive ? activeRef : undefined}
                  href={`/projects/${projectId}/${step.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`${stepAccessibleName(step, status, summary)}${attention[step.id] ? `, needs attention: ${attention[step.id]}` : ""}`}
                  // Active step as Reporting Hub's active nav item: Navy Medium text over a
                  // 3px Orange bar (non-text accent alongside the White fill and the word).
                  className={`group flex min-h-11 cursor-pointer items-start gap-2 border-b-[3px] px-3 pb-2 pt-2.5 text-left focus-inset motion-safe:transition-colors motion-safe:duration-150 ${
                    isActive
                      ? "border-orange bg-surface"
                      : "border-transparent hover:bg-line-soft active:bg-line"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      status === "done"
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "border-2 border-primary text-primary"
                          : "border border-border-strong text-muted-foreground"
                    }`}
                  >
                    {status === "done" ? "✓" : step.order}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={`text-sm ${
                        isActive
                          ? "font-medium text-foreground"
                          : "font-normal text-foreground/75 group-hover:text-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        isActive
                          ? "text-muted-foreground-strong"
                          : "text-muted-foreground group-hover:text-muted-foreground-strong"
                      }`}
                    >
                      <StepStatusIcon status={status} />
                      {summary ? summary.text : STEP_STATUS_LABEL[status]}
                    </span>
                    {attention[step.id] && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
                        <span className="sr-only">Needs attention: </span>
                        {attention[step.id]}
                      </span>
                    )}
                  </span>
                </Link>
                {summary?.downloadHref && (
                  <a
                    href={summary.downloadHref}
                    className="ml-11 inline-flex min-h-6 items-center text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {summary.downloadLabel ?? "Download"}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
