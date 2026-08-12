/**
 * Presentation-layer grouping of Stages into Phases for the Stage Tracker.
 * Additive only — Stages remain the source of truth for tracking/versioning
 * (see CLAUDE.md's "Phase Presentation Layer" section). This is a static
 * config object, not a database model.
 */
export interface Phase {
  key: string;
  name: string;
  stageNumbers: number[];
}

export const PHASES: Phase[] = [
  {
    key: "clarifying",
    name: "Clarifying the brief and scope",
    stageNumbers: [1, 2, 3, 4],
  },
  {
    key: "estimation",
    name: "Estimation and team planning",
    stageNumbers: [5, 6, 7],
  },
  {
    key: "sow",
    name: "Statement of work and delivery setup",
    stageNumbers: [8, 9],
  },
];

// Stage 10 (Commercial Status) is explicitly not part of any Phase — it
// recurs continuously through delivery rather than completing once, so it's
// modeled as a separate, ongoing "Delivery Monitoring" indicator.
export const DELIVERY_MONITORING_STAGE_NUMBER = 10;

/**
 * Phase-scoped step label (e.g. "1.3" for the 3rd stage of the 1st Phase) —
 * helps the mental model of "which phase am I in, how far through it" more
 * than a flat 1-10 stage number does. Falls back to the plain stage number
 * for a stage that isn't in any Phase (currently just Delivery Monitoring).
 */
export function getStepLabel(stageNumber: number): string {
  for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex++) {
    const stepIndex = PHASES[phaseIndex].stageNumbers.indexOf(stageNumber);
    if (stepIndex !== -1) {
      return `${phaseIndex + 1}.${stepIndex + 1}`;
    }
  }
  return String(stageNumber);
}
