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
