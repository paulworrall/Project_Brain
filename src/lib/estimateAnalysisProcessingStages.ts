/**
 * Stage copy for the "Analyze & build" processing overlay — see
 * capabilitySuggestionProcessingStages.ts for the pattern this mirrors.
 * Four stages since a full analyze run can involve rate-card-line parsing,
 * role extraction, matching, and pricing — a longer pipeline than the
 * two-stage capability-suggestion flow.
 */
export const ESTIMATE_ANALYSIS_PROCESSING_STAGES = [
  "Reading capability inputs",
  "Extracting roles and quantities",
  "Matching against the rate card",
  "Calculating pricing",
] as const;

export const ESTIMATE_ANALYSIS_STAGE_DURATIONS_MS = [1200, 2200, 2200, 800];
