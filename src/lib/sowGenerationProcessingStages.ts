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

/** The first step: reading the project's inputs and proposing items for the PM to review. */
export const SOW_EXTRACTION_PROCESSING_STAGES = [
  "Gathering project details",
  "Proposing deliverables, services, assumptions and risks",
] as const;

export const SOW_EXTRACTION_STAGE_DURATIONS_MS = [1500, 6000];
