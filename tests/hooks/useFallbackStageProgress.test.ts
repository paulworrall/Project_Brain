// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";

const DURATIONS = [1000, 2000, 1000];

describe("useFallbackStageProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle at stage 0 while inactive", () => {
    const { result } = renderHook(() => useFallbackStageProgress(false, DURATIONS));
    expect(result.current).toEqual({ stageIndex: 0, isFinalHold: false, elapsedInFinalHoldMs: 0 });
  });

  it("advances through stages on the paced schedule once active", () => {
    const { result } = renderHook(() => useFallbackStageProgress(true, DURATIONS));

    expect(result.current.stageIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.stageIndex).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.stageIndex).toBe(2);
  });

  it("holds on the final stage and reports elapsed hold time instead of looping once the schedule is exhausted", () => {
    const { result } = renderHook(() => useFallbackStageProgress(true, DURATIONS));

    // Total budget is 4000ms; push well past it.
    act(() => {
      vi.advanceTimersByTime(4000 + 3000);
    });

    expect(result.current.stageIndex).toBe(DURATIONS.length - 1);
    expect(result.current.isFinalHold).toBe(true);
    expect(result.current.elapsedInFinalHoldMs).toBeGreaterThanOrEqual(3000);
  });

  it("resets back to idle when active turns false", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useFallbackStageProgress(active, DURATIONS),
      { initialProps: { active: true } }
    );

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.stageIndex).toBe(1);

    rerender({ active: false });
    expect(result.current).toEqual({ stageIndex: 0, isFinalHold: false, elapsedInFinalHoldMs: 0 });
  });
});
