"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { PROJECT_PHASES, getPhase, isPhaseId, type PhaseId, type PhaseStatus } from "@/lib/projectPhases";
import { PhaseTabs } from "./PhaseTabs";
import { PreviousPhaseNotice } from "./PreviousPhaseNotice";

/**
 * Tab row + two-column area of the project page. Lives in the project layout,
 * so it (and the sidebar inside it) persists across phase tabs.
 *
 * - Discover's content is passed in as `discover` and kept mounted but hidden
 *   while another phase shows, so unsaved edits in its cards survive a tab
 *   switch. Other phases arrive through `children` (the routed phase page).
 * - The sidebar renders once. Wide screens: sticky column. Below `lg`: the same
 *   element becomes a slide-in drawer opened by "Project tools" — one instance,
 *   so Ask me anything / update drafts / checklist state are shared.
 */
export function ProjectShell({
  projectId,
  phaseStatuses,
  discover,
  sidebar,
  children,
}: {
  projectId: string;
  phaseStatuses: Record<PhaseId, PhaseStatus>;
  discover: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const activePhaseId = segment && isPhaseId(segment) ? segment : null;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const asideRef = useRef<HTMLElement>(null);
  const previousPhaseRef = useRef(activePhaseId);
  const toolsTitleId = useId();

  useFocusTrap(asideRef, toolsOpen);

  // On a tab switch: announce the change and close the drawer. Adjusted during
  // render (not in an effect) so it lands in the same commit as the new phase.
  const [shownPhaseId, setShownPhaseId] = useState(activePhaseId);
  if (shownPhaseId !== activePhaseId) {
    setShownPhaseId(activePhaseId);
    setToolsOpen(false);
    setAnnouncement(
      activePhaseId
        ? `Showing ${getPhase(activePhaseId).label} phase, ${phaseStatuses[activePhaseId].replace("_", " ")}`
        : ""
    );
  }

  // ...and move focus to the phase content heading once it has rendered.
  useEffect(() => {
    if (previousPhaseRef.current === activePhaseId) return;
    previousPhaseRef.current = activePhaseId;
    if (activePhaseId) document.getElementById("phase-heading")?.focus();
  }, [activePhaseId]);

  useEffect(() => {
    if (!toolsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setToolsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toolsOpen]);

  const activePhase = activePhaseId ? getPhase(activePhaseId) : null;
  const previousPhase = activePhase && activePhase.order > 1 ? PROJECT_PHASES[activePhase.order - 2] : null;
  const showPreviousNotice = previousPhase !== null && phaseStatuses[previousPhase.id] !== "complete";
  const discoverPhase = getPhase("discover");
  const discoverActive = activePhaseId === "discover";

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 border-b border-border">
        <PhaseTabs projectId={projectId} phaseStatuses={phaseStatuses} activePhaseId={activePhaseId} />
        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          aria-expanded={toolsOpen}
          className="mb-1 shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
        >
          Project tools
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
          {showPreviousNotice && previousPhase && <PreviousPhaseNotice previousPhaseLabel={previousPhase.label} />}

          <div hidden={!discoverActive}>
            <section aria-labelledby={discoverActive ? "phase-heading" : undefined} className="space-y-4">
              <h2
                id={discoverActive ? "phase-heading" : undefined}
                tabIndex={-1}
                className="text-lg font-semibold text-foreground outline-none"
              >
                {discoverPhase.label} — {discoverPhase.verbs[0]} · {discoverPhase.verbs[1]}
              </h2>
              {/* TODO: Delivery Monitoring (inside Discover for now) may move to Dialogue or the sidebar. */}
              {discover}
            </section>
          </div>

          {children}
        </div>

        {toolsOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
            onClick={() => setToolsOpen(false)}
          />
        )}
        <aside
          ref={asideRef}
          aria-label={toolsOpen ? undefined : "Project tools"}
          aria-labelledby={toolsOpen ? toolsTitleId : undefined}
          role={toolsOpen ? "dialog" : undefined}
          aria-modal={toolsOpen ? true : undefined}
          tabIndex={-1}
          className={`outline-none lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto ${
            toolsOpen
              ? "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:block max-lg:w-full max-lg:max-w-md max-lg:overflow-y-auto max-lg:border-l max-lg:border-border max-lg:bg-surface max-lg:p-5 max-lg:shadow-lg"
              : "hidden"
          }`}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <h2 id={toolsTitleId} className="text-base font-semibold text-foreground">
              Project tools
            </h2>
            <button
              type="button"
              onClick={() => setToolsOpen(false)}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
