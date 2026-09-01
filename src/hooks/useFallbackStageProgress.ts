"use client";

import { useEffect, useRef, useState } from "react";

export interface FallbackStageProgress {
  /** Index into the caller's stage-label array. */
  stageIndex: number;
  /** True once the fallback has paced through every stage but is still active. */
  isFinalHold: boolean;
  /** Time spent in the final hold, for a "still working" / elapsed-time message. */
  elapsedInFinalHoldMs: number;
}

const IDLE: FallbackStageProgress = { stageIndex: 0, isFinalHold: false, elapsedInFinalHoldMs: 0 };

/**
 * Time-based stand-in for real per-stage progress events. The backend
 * (intake-agent.ts) currently runs as a single opaque Server Action call, so
 * there is no real signal to say "step 2 of 4 just finished" — this hook
 * paces stageIndex forward on a fixed schedule (`stageDurationsMs`) purely
 * for perceived progress.
 *
 * Once the schedule is exhausted but `active` is still true (the real
 * request is taking longer than the paced budget), it holds on the last
 * stage and reports elapsed hold time instead of looping — see the
 * `isFinalHold` field, used for the "no dead air" reassurance message.
 *
 * `stageDurationsMs` should be a stable reference (module-level constant or
 * memoized) — it's an effect dependency.
 *
 * When real progress events exist, replace calls to this hook with state
 * driven by those events — every consumer (ProcessingOverlay) takes
 * `stageIndex`/`isFinalHold`/`elapsedInFinalHoldMs` as plain props, so
 * nothing downstream needs to change.
 */
export function useFallbackStageProgress(
  active: boolean,
  stageDurationsMs: number[],
  tickMs = 250
): FallbackStageProgress {
  const [progress, setProgress] = useState<FallbackStageProgress>(IDLE);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      return;
    }

    const start = Date.now();
    startRef.current = start;
    const totalMs = stageDurationsMs.reduce((sum, duration) => sum + duration, 0);
    const lastIndex = Math.max(0, stageDurationsMs.length - 1);

    function tick() {
      const elapsed = Date.now() - start;

      if (elapsed >= totalMs) {
        setProgress({ stageIndex: lastIndex, isFinalHold: true, elapsedInFinalHoldMs: elapsed - totalMs });
        return;
      }

      let cumulative = 0;
      let index = lastIndex;
      for (let i = 0; i < stageDurationsMs.length; i++) {
        cumulative += stageDurationsMs[i];
        if (elapsed < cumulative) {
          index = i;
          break;
        }
      }
      setProgress({ stageIndex: index, isFinalHold: false, elapsedInFinalHoldMs: 0 });
    }

    tick();
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [active, stageDurationsMs, tickMs]);

  return active ? progress : IDLE;
}
