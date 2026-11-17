"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  PROJECT_STEPS,
  STEP_STATUS_LABEL,
  isStepId,
  type StepId,
  type StepStatus,
  type StepSummary,
} from "@/lib/projectSteps";
import { ProjectStepper } from "./ProjectStepper";
import { NextStepBanner, type CompletionSummary } from "./NextStepBanner";
import { Button } from "@/components/ui/Button";
import type { NextAction } from "@/lib/nextAction";

/**
 * Stepper + two-column area of the project page (FB-008; FB-007's shell with
 * steps in place of phases). Lives in the project layout, so it — and the
 * sidebar inside it — persists across step switches.
 *
 * - All three steps' content is passed in and kept mounted, only the active
 *   one shown, so unsaved edits in a step survive switching away and back.
 *   `children` is the routed step page, which renders nothing of its own.
 * - The sidebar (the Project assistant) renders once. Wide screens: sticky
 *   column. Below `lg`: the same element becomes a slide-in drawer opened by
 *   "Project assistant" — one instance, so a draft message survives.
 */
export function ProjectShell({
  projectId,
  stepStatuses,
  stepSummaries,
  attention,
  nextAction,
  openQuestionsText = "",
  completion = null,
  steps,
  sidebar,
  children,
}: {
  projectId: string;
  stepStatuses: Record<StepId, StepStatus>;
  stepSummaries: Partial<Record<StepId, StepSummary>>;
  /** Per-step attention flags shown in the stepper (e.g. "Updated since SOW"). */
  attention?: Partial<Record<StepId, string>>;
  /** FB-009 C: the one next action, shown under the stepper. */
  nextAction?: NextAction;
  /** FB-011: the open questions as a numbered list, for the banner's "Copy questions". */
  openQuestionsText?: string;
  /** FB-012: the complete-project success block's facts (set only once the SOW is approved). */
  completion?: CompletionSummary | null;
  steps: Record<StepId, ReactNode>;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const activeStepId = segment && isStepId(segment) ? segment : null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Complete: the success block carries both downloads, so the stepper keeps only its SOW link.
  const stepperSummaries: Partial<Record<StepId, StepSummary>> =
    completion && stepSummaries.estimate
      ? {
          ...stepSummaries,
          estimate: { ...stepSummaries.estimate, downloadHref: undefined, downloadLabel: undefined },
        }
      : stepSummaries;
  const [announcement, setAnnouncement] = useState("");
  const asideRef = useRef<HTMLElement>(null);
  const previousStepRef = useRef(activeStepId);
  const drawerTitleId = useId();

  useFocusTrap(asideRef, drawerOpen);

  // On a step switch: announce the change and close the drawer. Adjusted during
  // render (not in an effect) so it lands in the same commit as the new step.
  const [shownStepId, setShownStepId] = useState(activeStepId);
  if (shownStepId !== activeStepId) {
    setShownStepId(activeStepId);
    setDrawerOpen(false);
    if (activeStepId) {
      const step = PROJECT_STEPS.find((s) => s.id === activeStepId)!;
      const summary =
        stepStatuses[activeStepId] === "done" ? stepSummaries[activeStepId] : undefined;
      setAnnouncement(
        `Showing ${step.heading} step, ${STEP_STATUS_LABEL[stepStatuses[activeStepId]].toLowerCase()}${summary ? `, ${summary.spoken}` : ""}`
      );
    } else {
      setAnnouncement("");
    }
  }

  // FB-009 C: announce when the next action changes (after any action, no reload).
  const [shownNextId, setShownNextId] = useState(nextAction?.id);
  if (nextAction && shownNextId !== nextAction.id) {
    setShownNextId(nextAction.id);
    if (shownNextId !== undefined) setAnnouncement(`Next step: ${nextAction.title}`);
  }

  // ...and move focus to the step heading once it has rendered. When the URL
  // names a place on the step (a Next step link), scroll there instead.
  useEffect(() => {
    if (previousStepRef.current === activeStepId) return;
    previousStepRef.current = activeStepId;
    if (!activeStepId) return;
    const target = window.location.hash
      ? document.getElementById(window.location.hash.slice(1))
      : null;
    document
      .getElementById(`step-heading-${activeStepId}`)
      ?.focus({ preventScroll: Boolean(target) });
    target?.scrollIntoView({ block: "start" });
  }, [activeStepId]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end lg:hidden">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
        >
          Project assistant
        </Button>
      </div>

      {/* FB-012: the stepper ("where you are") and the Next step banner ("what to do
          now") read as one block, in one bordered container. */}
      <div className="border border-border bg-surface">
        <ProjectStepper
          projectId={projectId}
          statuses={stepStatuses}
          summaries={stepperSummaries}
          activeStepId={activeStepId}
          attention={attention}
        />
        {nextAction && (
          <div className="border-t border-border">
            <NextStepBanner
              action={nextAction}
              openQuestionsText={openQuestionsText}
              completion={completion}
            />
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-6">
          {PROJECT_STEPS.map((step) => (
            <div key={step.id} hidden={step.id !== activeStepId} data-step={step.id}>
              {steps[step.id]}
            </div>
          ))}
          {children}
        </div>

        {drawerOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-foreground/50 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <aside
          ref={asideRef}
          aria-label={drawerOpen ? undefined : "Project assistant"}
          aria-labelledby={drawerOpen ? drawerTitleId : undefined}
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen ? true : undefined}
          tabIndex={-1}
          className={`outline-none lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto ${
            drawerOpen
              ? "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:block max-lg:w-full max-lg:max-w-md max-lg:overflow-y-auto max-lg:border-l max-lg:border-border max-lg:bg-surface max-lg:p-5"
              : "hidden"
          }`}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <h2 id={drawerTitleId} className="text-base font-medium text-foreground">
              Project assistant
            </h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="min-h-11 px-2 py-1 text-sm font-medium text-primary hover:underline"
            >
              Close
            </button>
          </div>
          {sidebar}
        </aside>
      </div>
    </div>
  );
}
