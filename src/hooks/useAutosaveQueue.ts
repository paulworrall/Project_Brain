"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveEntry {
  status: AutosaveStatus;
  /** Why the last save failed. */
  message?: string;
  /** Lets the caller tell failure kinds apart (e.g. "conflict"). */
  kind?: string;
}

export type AutosaveSaveResult = { ok: true } | { ok: false; message: string; kind?: string };

export interface AutosaveQueue<P> {
  /** Per-key save state, for the visible Saving… / Saved / error text. */
  entries: Record<string, AutosaveEntry>;
  /** Record an edit (merged into whatever's already pending for the key). Doesn't save yet. */
  markDirty: (key: string, patch: Partial<P>) => void;
  /** Start the debounce countdown for a key (call on blur). */
  schedule: (key: string) => void;
  /** Save everything pending now. Resolves true only if nothing is left unsaved. */
  flush: () => Promise<boolean>;
  /** Retry one key's pending edit immediately. */
  retry: (key: string) => Promise<boolean>;
  /** Drop a key's pending edit (e.g. "use their version" after a conflict). */
  discard: (key: string) => void;
  /** True while any edit is unsaved or in flight. */
  hasUnsaved: () => boolean;
  /** True if a key has an edit that hasn't been saved yet. */
  isDirty: (key: string) => boolean;
}

/**
 * Debounced, per-key autosave. Edits are recorded with markDirty as they
 * happen, saved shortly after the field loses focus (schedule), and — the
 * part navigation depends on — flush() saves everything pending right now and
 * reports whether it all landed, so Next/Back/close can refuse to move on
 * while a save has failed. Saves for one key are serialised, a failed save
 * keeps its edit pending (retry() or the next flush tries again), and an edit
 * made while a save is in flight is kept for the next one.
 */
export function useAutosaveQueue<P extends object>(
  save: (key: string, patch: P) => Promise<AutosaveSaveResult>,
  debounceMs = 600
): AutosaveQueue<P> {
  const [entries, setEntries] = useState<Record<string, AutosaveEntry>>({});
  const pending = useRef(new Map<string, Partial<P>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const setEntry = useCallback((key: string, entry: AutosaveEntry) => {
    setEntries((prev) => ({ ...prev, [key]: entry }));
  }, []);

  const clearTimer = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
  }, []);

  const runSave = useCallback(
    (key: string): Promise<void> => {
      clearTimer(key);
      const prior = inflight.current.get(key) ?? Promise.resolve();
      const run = prior.then(async () => {
        const patch = pending.current.get(key);
        if (!patch) return;
        pending.current.delete(key);
        setEntry(key, { status: "saving" });
        let result: AutosaveSaveResult;
        try {
          result = await saveRef.current(key, patch as P);
        } catch {
          result = { ok: false, message: "Couldn't save — check your connection and retry." };
        }
        if (result.ok) {
          // Edited again while saving: that newer edit is still pending.
          setEntry(key, { status: pending.current.has(key) ? "idle" : "saved" });
        } else {
          // Keep the edit, with anything newer layered on top, so a retry sends it all.
          pending.current.set(key, { ...patch, ...pending.current.get(key) });
          setEntry(key, { status: "error", message: result.message, kind: result.kind });
        }
      });
      inflight.current.set(key, run);
      void run.then(() => {
        if (inflight.current.get(key) === run) inflight.current.delete(key);
      });
      return run;
    },
    [clearTimer, setEntry]
  );

  const markDirty = useCallback(
    (key: string, patch: Partial<P>) => {
      pending.current.set(key, { ...pending.current.get(key), ...patch });
      // A fresh edit supersedes a stale "Saved"; an error stays until it's retried.
      setEntries((prev) =>
        prev[key]?.status === "error" ? prev : { ...prev, [key]: { status: "idle" } }
      );
    },
    []
  );

  const schedule = useCallback(
    (key: string) => {
      if (!pending.current.has(key)) return;
      clearTimer(key);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          void runSave(key);
        }, debounceMs)
      );
    },
    [clearTimer, debounceMs, runSave]
  );

  const flush = useCallback(async (): Promise<boolean> => {
    const keys = new Set([...pending.current.keys(), ...inflight.current.keys()]);
    await Promise.all([...keys].map((key) => runSave(key)));
    return pending.current.size === 0;
  }, [runSave]);

  const retry = useCallback(
    async (key: string): Promise<boolean> => {
      await runSave(key);
      return !pending.current.has(key);
    },
    [runSave]
  );

  const discard = useCallback(
    (key: string) => {
      clearTimer(key);
      pending.current.delete(key);
      setEntry(key, { status: "idle" });
    },
    [clearTimer, setEntry]
  );

  const hasUnsaved = useCallback(
    () => pending.current.size > 0 || inflight.current.size > 0,
    []
  );

  const isDirty = useCallback((key: string) => pending.current.has(key), []);

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      pendingTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { entries, markDirty, schedule, flush, retry, discard, hasUnsaved, isDirty };
}
