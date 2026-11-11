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
  steps,
  sidebar,
  children,
}: {
  projectId: string;
  stepStatuses: Record<StepId, StepStatus>;
  stepSummaries: Partial<Record<StepId, StepSummary>>;
  /** Per-step attention flags shown in the stepper (e.g. "Updated since SOW"). */
  attention?: Partial<Record<StepId, string>>;
  steps: Record<StepId, ReactNode>;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const activeStepId = segment && isStepId(segment) ? segment : null;
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // ...and move focus to the step heading once it has rendered.
  useEffect(() => {
    if (previousStepRef.current === activeStepId) return;
    previousStepRef.current = activeStepId;
    if (activeStepId) document.getElementById(`step-heading-${activeStepId}`)?.focus();
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
      <div className="flex items-end gap-2 border-b border-border">
        <ProjectStepper
          projectId={projectId}
          statuses={stepStatuses}
          summaries={stepSummaries}
          activeStepId={activeStepId}
          attention={attention}
        />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          className="mb-1 min-h-11 shrink-0 border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted lg:hidden"
        >
          Project assistant
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
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
