/**
 * Stage copy for the Scope summary processing overlay (regenerate, and create
 * from earlier documents) — a single Claude call under the hood, so a short
 * paced fallback. See intakeProcessingStages.ts for the pattern.
 */
export const SCOPE_SUMMARY_PROCESSING_STAGES = [
  "Reading the brief and every update",
  "Drafting the scope summary",
] as const;

export const SCOPE_SUMMARY_STAGE_DURATIONS_MS = [1500, 4000];
