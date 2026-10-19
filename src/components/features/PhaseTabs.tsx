"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  PHASE_STATUS_LABEL,
  PROJECT_PHASES,
  type PhaseId,
  type PhaseStatus,
} from "@/lib/projectPhases";
import { PhaseStatusIndicator } from "./PhaseStatusIndicator";

// Static class names (not built from the token) so Tailwind can see them.
const ACCENT_CLASS: Record<string, string> = {
  "phase-discover": "bg-phase-discover",
  "phase-define": "bg-phase-define",
  "phase-develop": "bg-phase-develop",
  "phase-deliver": "bg-phase-deliver",
  "phase-dialogue": "bg-phase-dialogue",
};

/**
 * The 5D phase tab bar. Each tab is a real link (the URL carries the phase),
 * so it's a labelled nav with aria-current — not role="tablist".
 */
export function PhaseTabs({
  projectId,
  phaseStatuses,
  activePhaseId,
}: {
  projectId: string;
  phaseStatuses: Record<PhaseId, PhaseStatus>;
  activePhaseId: PhaseId | null;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // Narrow screens scroll the bar horizontally — keep the active tab visible.
    activeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activePhaseId]);

  return (
    <nav aria-label="Project phases" className="min-w-0 flex-1 overflow-x-auto">
      <ol className="flex min-w-max items-stretch">
        {PROJECT_PHASES.map((phase, index) => {
          const status = phaseStatuses[phase.id];
          const isActive = phase.id === activePhaseId;
          return (
            <li key={phase.id} className="flex items-stretch">
              {index > 0 && (
                <span aria-hidden="true" className="my-auto h-px w-4 shrink-0 bg-border sm:w-8" />
              )}
              <Link
                ref={isActive ? activeRef : undefined}
                href={`/projects/${projectId}/${phase.id}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${phase.label}, ${PHASE_STATUS_LABEL[status].toLowerCase()}`}
                className={`relative flex flex-col gap-0.5 rounded-t-md border-b-2 px-3 py-2 pt-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-colors ${
                  isActive ? "border-primary bg-surface" : "border-transparent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 top-0 h-1 rounded-full ${ACCENT_CLASS[phase.accentToken] ?? "bg-border"}`}
                />
                <span className={`text-sm text-foreground ${isActive ? "font-semibold" : "font-medium"}`}>
                  {phase.label}
                </span>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {phase.verbs[0]} · {phase.verbs[1]}
                </span>
                <PhaseStatusIndicator status={status} />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
