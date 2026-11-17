/**
 * Stage copy for the New Project processing overlay, ordered to match the
 * real intake-agent.ts pipeline (classify -> key details -> scope summary;
 * FB-011 removed the clarification email and set-up checklist stages) so
 * that wiring real per-stage progress
 * events in later doesn't require reordering this list — only "Reading your
 * brief" has no backend equivalent (it covers the moment before the agent
 * call even starts).
 */
export const INTAKE_PROCESSING_STAGES = [
  "Reading your brief",
  "Classifying workstream",
  "Preparing position document",
] as const;

/**
 * Paced fallback durations (ms), one per stage above. Tuned to the relative
 * cost of each real step (the scope summary call takes longest;
 * classification is comparatively fast) — not a
 * measurement of real elapsed time, since actual LLM latency varies per
 * request. Once this budget is exhausted and the request is still pending,
 * useFallbackStageProgress holds on the last stage rather than looping.
 */
export const INTAKE_STAGE_DURATIONS_MS = [800, 3500, 6000];
