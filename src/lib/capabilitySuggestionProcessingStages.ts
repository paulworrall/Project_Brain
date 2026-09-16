/**
 * Stage copy for the capability-suggestion processing overlay — see
 * intakeProcessingStages.ts for the pattern this mirrors. A single Claude
 * call under the hood (capability-assessment-agent.ts), so this is a short,
 * two-stage paced fallback rather than a long pipeline.
 */
export const CAPABILITY_SUGGESTION_PROCESSING_STAGES = [
  "Reading the captured brief content",
  "Matching against MAP capabilities",
] as const;

export const CAPABILITY_SUGGESTION_STAGE_DURATIONS_MS = [1200, 2200];
