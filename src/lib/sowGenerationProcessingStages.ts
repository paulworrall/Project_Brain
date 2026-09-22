/**
 * Stage copy for the "Generate SOW" processing overlay — see
 * capabilitySuggestionProcessingStages.ts for the pattern this mirrors.
 */
export const SOW_GENERATION_PROCESSING_STAGES = [
  "Gathering project details",
  "Drafting the Statement of Work",
  "Rendering the document",
] as const;

export const SOW_GENERATION_STAGE_DURATIONS_MS = [1500, 5500, 1500];
