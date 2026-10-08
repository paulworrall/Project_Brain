// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutosaveQueue, type AutosaveSaveResult } from "@/hooks/useAutosaveQueue";

type Patch = { text?: string; included?: boolean };

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosaveQueue", () => {
  it("saves a dirty key once the debounce elapses after schedule(), showing Saving… then Saved", async () => {
    vi.useFakeTimers();
    let release: (r: AutosaveSaveResult) => void = () => {};
    const save = vi.fn(
      () => new Promise<AutosaveSaveResult>((resolve) => (release = resolve))
    );
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 500));

    act(() => {
      result.current.markDirty("a", { text: "hello" });
      result.current.schedule("a");
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).toHaveBeenCalledWith("a", { text: "hello" });
    expect(result.current.entries.a.status).toBe("saving");

    await act(async () => release({ ok: true }));
    expect(result.current.entries.a.status).toBe("saved");
    expect(result.current.hasUnsaved()).toBe(false);
  });

  it("restarts the debounce on repeated schedule() and merges patches for the same key", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({ ok: true }));
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 500));

    act(() => {
      result.current.markDirty("a", { text: "one" });
      result.current.schedule("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      result.current.markDirty("a", { included: false });
      result.current.schedule("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a", { text: "one", included: false });
  });

  it("flush() saves everything pending immediately, without waiting for the debounce", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({ ok: true }));
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => {
      result.current.markDirty("a", { text: "A" });
      result.current.markDirty("b", { text: "B" });
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.hasUnsaved()).toBe(false);
  });

  it("a failed save keeps the edit pending, flags the key, and makes flush() report false", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({ ok: false, message: "Network down" }));
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => result.current.markDirty("a", { text: "A" }));
    let ok = true;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(false);
    expect(result.current.entries.a).toMatchObject({ status: "error", message: "Network down" });
    expect(result.current.hasUnsaved()).toBe(true);
  });

  it("retry() resends the kept edit and clears the error when it lands", async () => {
    const save = vi
      .fn<(key: string, patch: Patch) => Promise<AutosaveSaveResult>>()
      .mockResolvedValueOnce({ ok: false, message: "Network down" })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => result.current.markDirty("a", { text: "A" }));
    await act(async () => {
      await result.current.flush();
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.retry("a");
    });

    expect(ok).toBe(true);
    expect(save).toHaveBeenLastCalledWith("a", { text: "A" });
    expect(result.current.entries.a.status).toBe("saved");
  });

  it("an edit made while a save is in flight is kept for the next save, not lost", async () => {
    const releases: Array<(r: AutosaveSaveResult) => void> = [];
    const save = vi
      .fn<(key: string, patch: Patch) => Promise<AutosaveSaveResult>>()
      .mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => result.current.markDirty("a", { text: "first" }));
    // Start a save and let it reach the (still pending) save function.
    await act(async () => {
      void result.current.retry("a");
    });
    expect(save).toHaveBeenCalledTimes(1);

    // The PM keeps typing while that save is in flight.
    act(() => result.current.markDirty("a", { text: "second" }));
    await act(async () => releases[0]({ ok: true }));
    // The in-flight save landing must not mark the newer edit as saved.
    expect(result.current.hasUnsaved()).toBe(true);
    expect(result.current.entries.a.status).toBe("idle");

    let flushed: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      flushed = result.current.flush();
    });
    await act(async () => releases[1]({ ok: true }));
    expect(await flushed).toBe(true);
    expect(save).toHaveBeenNthCalledWith(1, "a", { text: "first" });
    expect(save).toHaveBeenNthCalledWith(2, "a", { text: "second" });
  });

  it("discard() drops a pending edit", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({ ok: true }));
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => result.current.markDirty("a", { text: "A" }));
    act(() => result.current.discard("a"));
    await act(async () => {
      await result.current.flush();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("treats a thrown save as a failure rather than crashing", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useAutosaveQueue<Patch>(save, 60_000));

    act(() => result.current.markDirty("a", { text: "A" }));
    let ok = true;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(false);
    expect(result.current.entries.a.status).toBe("error");
  });
});
