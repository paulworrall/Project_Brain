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
                // Centred on the label line; not part of either tab's hit area.
                <span
                  aria-hidden="true"
                  className="mt-[26px] h-px w-4 shrink-0 self-start bg-border/60 sm:w-8"
                />
              )}
              <Link
                ref={isActive ? activeRef : undefined}
                href={`/projects/${projectId}/${phase.id}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${phase.label}, ${PHASE_STATUS_LABEL[status].toLowerCase()}`}
                className={`group relative flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-t-md border-b-[3px] px-3 pb-2 pt-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-safe:transition-colors motion-safe:duration-150 ${
                  // The global `* { border-color }` rule is unlayered and would beat plain utilities, hence `!`.
                  isActive
                    ? "border-primary! bg-accent"
                    : "border-transparent! hover:bg-surface-muted active:bg-border"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 top-0 rounded-full ${isActive ? "h-1" : "h-[3px]"} ${ACCENT_CLASS[phase.accentToken] ?? "bg-border"}`}
                />
                <span
                  className={`text-sm motion-safe:transition-colors motion-safe:duration-150 ${
                    isActive
                      ? "font-semibold text-primary"
                      : "font-medium text-foreground/75 group-hover:text-foreground"
                  }`}
                >
                  {phase.label}
                </span>
                <span
                  className={`hidden text-xs md:block ${isActive ? "text-muted-foreground-strong" : "text-muted-foreground group-hover:text-muted-foreground-strong"}`}
                >
                  {phase.verbs[0]} · {phase.verbs[1]}
                </span>
                <PhaseStatusIndicator
                  status={status}
                  className={
                    isActive
                      ? "text-muted-foreground-strong"
                      : "text-muted-foreground group-hover:text-muted-foreground-strong"
                  }
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
