"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useAutosaveQueue, type AutosaveEntry, type AutosaveQueue, type AutosaveSaveResult } from "@/hooks/useAutosaveQueue";
import {
  acceptSowSuggestionAction,
  addSowItemAction,
  deleteSowItemAction,
  dismissSowSuggestionAction,
  revertSowItemAction,
  saveSowItemAction,
  saveSowReviewStepAction,
} from "@/app/(dashboard)/projects/[projectId]/sow-review-actions";
import {
  SOW_REVIEW_FINAL_STEP,
  SOW_REVIEW_SECTIONS,
  checkStepAdvance,
  clampStep,
  includeLabel,
  itemsInSection,
  sectionCounts,
  sectionDef,
  stepIndicator,
  stepLabel,
  type SowItemDto,
  type SowItemResultLike,
  type SowSectionKey,
} from "@/lib/sowReview";

type ItemPatch = { text?: string; included?: boolean };

export interface SowReviewOverlayProps {
  projectId: string;
  initialItems: SowItemDto[];
  initialStep: number;
  /** Called after pending saves have flushed — "Save & exit", the close button, or Escape. */
  onClose: () => void;
  /** The PM chose "Generate SOW" on the last step; the parent runs composition behind ProcessingOverlay. */
  onGenerate: () => void;
  /** Composition is running (the parent's ProcessingOverlay is on top): controls are disabled. */
  generating?: boolean;
}

const BADGE_BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

function ProvenanceBadges({ item }: { item: SowItemDto }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.source === "AGENT" && (
        <span className={`${BADGE_BASE} bg-surface-muted text-muted-foreground`}>Suggested</span>
      )}
      {item.source === "PM_EDITED" && (
        <span className={`${BADGE_BASE} bg-primary/10 text-primary`}>Edited by PM</span>
      )}
      {item.source === "PM_ADDED" && (
        <span className={`${BADGE_BASE} bg-primary/10 text-primary`}>Added by PM</span>
      )}
      {item.isNewSinceLastReview && (
        <span className={`${BADGE_BASE} bg-warning-bg text-foreground`}>New since last review</span>
      )}
    </span>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  onBlur,
  label,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      className={`block w-full resize-none overflow-hidden rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring ${className ?? ""}`}
    />
  );
}

function SaveState({
  entry,
  onRetry,
  onKeepMine,
  onUseTheirs,
}: {
  entry: AutosaveEntry | undefined;
  onRetry: () => void;
  onKeepMine: () => void;
  onUseTheirs: () => void;
}) {
  if (!entry || entry.status === "idle") return null;
  if (entry.status === "saving") return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (entry.status === "saved") return <span className="text-xs text-success">Saved</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-danger" data-testid="item-save-error">
      <span>{entry.message ?? "Couldn't save this item."}</span>
      {entry.kind === "conflict" ? (
        <>
          <button type="button" onClick={onKeepMine} className="font-medium underline">
            Keep my edit
          </button>
          <button type="button" onClick={onUseTheirs} className="font-medium underline">
            Use their version
          </button>
        </>
      ) : (
        <button type="button" onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      )}
    </span>
  );
}

export function SowReviewOverlay({
  projectId,
  initialItems,
  initialStep,
  onClose,
  onGenerate,
  generating = false,
}: SowReviewOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const [items, setItems] = useState<SowItemDto[]>(initialItems);
  const itemsRef = useRef<SowItemDto[]>(initialItems);
  const [step, setStep] = useState(() => clampStep(initialStep));
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [navBusy, setNavBusy] = useState(false);
  const [live, setLive] = useState("");
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  // Server copies of items someone else changed under us, kept for "Use their version".
  const conflictsRef = useRef(new Map<string, SowItemDto>());

  useFocusTrap(containerRef, true);

  const commitItems = useCallback((updater: (prev: SowItemDto[]) => SowItemDto[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const queueRef = useRef<AutosaveQueue<ItemPatch> | null>(null);

  const saveItem = useCallback(
    async (id: string, patch: ItemPatch): Promise<AutosaveSaveResult> => {
      const current = itemsRef.current.find((i) => i.id === id);
      if (!current) return { ok: true };
      const result: SowItemResultLike = await saveSowItemAction(projectId, id, patch, current.version);
      if (result.ok) {
        const dirty = queueRef.current?.isDirty(id) ?? false;
        commitItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? // The PM typed more while this was saving: keep what's on screen, take the server's bookkeeping.
                { ...result.item, ...(dirty ? { text: i.text, included: i.included } : {}) }
              : i
          )
        );
        return { ok: true };
      }
      if (result.code === "conflict" && result.item) {
        const theirs = result.item;
        conflictsRef.current.set(id, theirs);
        // Adopt their version number (so "Keep my edit" can succeed) but leave the PM's edit on screen.
        commitItems((prev) => prev.map((i) => (i.id === id ? { ...i, version: theirs.version } : i)));
        return { ok: false, message: result.message, kind: "conflict" };
      }
      if (result.code === "not_found") {
        commitItems((prev) => prev.filter((i) => i.id !== id));
        return { ok: true };
      }
      return { ok: false, message: result.message };
    },
    [projectId, commitItems]
  );

  const queue = useAutosaveQueue<ItemPatch>(saveItem);
  useEffect(() => {
    queueRef.current = queue;
  });

  // Save progress for screen readers, derived from the per-item states (the
  // visible per-item "Saving…/Saved" text is too chatty to announce itself).
  const saveAnnouncement = (() => {
    const values = Object.values(queue.entries);
    const errors = values.filter((e) => e.status === "error").length;
    if (errors > 0) return `${errors} ${errors === 1 ? "item" : "items"} couldn't be saved.`;
    if (values.some((e) => e.status === "saving")) return "Saving…";
    if (values.some((e) => e.status === "saved")) return "All changes saved.";
    return "";
  })();

  // Land on the step heading on mount and whenever the step changes.
  useEffect(() => {
    headingRef.current?.focus();
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [step]);

  const replaceItem = useCallback(
    (item: SowItemDto) => commitItems((prev) => prev.map((i) => (i.id === item.id ? item : i))),
    [commitItems]
  );

  // --- item edits -------------------------------------------------------
  function handleTextChange(id: string, text: string) {
    commitItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)));
    queue.markDirty(id, { text });
  }

  function handleToggle(id: string, included: boolean) {
    commitItems((prev) => prev.map((i) => (i.id === id ? { ...i, included } : i)));
    queue.markDirty(id, { included });
    queue.schedule(id);
  }

  async function runItemAction(
    id: string,
    action: (version: number) => Promise<SowItemResultLike>,
    announceOk: string
  ) {
    // Save anything pending first, so the action sees the item's latest version.
    const flushed = await queue.flush();
    if (!flushed) {
      setBlockedMessage("Some changes couldn't be saved. Retry the items marked below first.");
      return;
    }
    const current = itemsRef.current.find((i) => i.id === id);
    if (!current) return;
    const result = await action(current.version);
    if (result.ok) {
      replaceItem(result.item);
      setLive(announceOk);
    } else {
      if (result.item) replaceItem(result.item);
      setBlockedMessage(result.message);
      setLive(result.message);
    }
  }

  async function handleAdd(section: SowSectionKey) {
    const item = await addSowItemAction(projectId, section);
    if (!item) return;
    commitItems((prev) => [...prev, item]);
    setFocusItemId(item.id);
    setLive(`Added a new ${sectionDef(section).noun}.`);
  }

  async function handleDelete(id: string) {
    await queue.flush();
    queue.discard(id);
    const current = itemsRef.current.find((i) => i.id === id);
    if (!current) return;
    const result = await deleteSowItemAction(projectId, id, current.version);
    if (result.ok) {
      commitItems((prev) => prev.filter((i) => i.id !== id));
      setLive("Item deleted.");
    } else {
      if (result.item) replaceItem(result.item);
      setBlockedMessage(result.message);
    }
  }

  // --- navigation -------------------------------------------------------
  async function flushOrBlock(): Promise<boolean> {
    const ok = await queue.flush();
    if (!ok) {
      const message = "Some changes couldn't be saved. Retry the items marked below before moving on.";
      setBlockedMessage(message);
      setLive(message);
    }
    return ok;
  }

  async function goTo(target: number) {
    const next = clampStep(target);
    setStep(next);
    setConfirmMessage(null);
    setBlockedMessage(null);
    setLive(stepIndicator(next));
    void saveSowReviewStepAction(projectId, next);
  }

  async function handleBack() {
    if (navBusy || step === 0) return;
    setNavBusy(true);
    if (await flushOrBlock()) await goTo(step - 1);
    setNavBusy(false);
  }

  async function handleNext(skipConfirm = false) {
    if (navBusy) return;
    setNavBusy(true);
    try {
      if (!(await flushOrBlock())) return;
      const section = SOW_REVIEW_SECTIONS[step].key;
      if (!skipConfirm) {
        const check = checkStepAdvance(section, itemsRef.current);
        if (check.kind === "blocked") {
          setBlockedMessage(check.message);
          setLive(check.message);
          return;
        }
        if (check.kind === "confirm") {
          setConfirmMessage(check.message);
          setLive(check.message);
          return;
        }
      }
      await goTo(step + 1);
    } finally {
      setNavBusy(false);
    }
  }

  async function handleJump(target: number) {
    if (navBusy) return;
    setNavBusy(true);
    if (await flushOrBlock()) await goTo(target);
    setNavBusy(false);
  }

  const handleClose = useCallback(async () => {
    if (navBusy || generating) return;
    setNavBusy(true);
    const ok = await queue.flush();
    if (!ok) {
      const message = "Some changes couldn't be saved. Retry the items marked below before closing.";
      setBlockedMessage(message);
      setLive(message);
      setNavBusy(false);
      return;
    }
    await saveSowReviewStepAction(projectId, step);
    setNavBusy(false);
    onClose();
  }, [navBusy, generating, queue, projectId, step, onClose]);

  async function handleGenerate() {
    if (navBusy || generating) return;
    setNavBusy(true);
    try {
      if (!(await flushOrBlock())) return;
      const check = checkStepAdvance("DELIVERABLES", itemsRef.current);
      if (check.kind === "blocked") {
        setBlockedMessage(check.message);
        setLive(check.message);
        return;
      }
      await saveSowReviewStepAction(projectId, SOW_REVIEW_FINAL_STEP);
      onGenerate();
    } finally {
      setNavBusy(false);
    }
  }

  // Escape = Save & exit (never loses edits: it flushes first).
  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void handleCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- render -----------------------------------------------------------
  const isFinal = step === SOW_REVIEW_FINAL_STEP;
  const section = isFinal ? null : SOW_REVIEW_SECTIONS[step];
  const sectionItems = section ? itemsInSection(items, section.key) : [];
  const disabled = navBusy || generating;
  const pendingSuggestions = items.filter((i) => i.pendingAgentSuggestion).length;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="sow-review-overlay"
      className="fixed inset-0 z-50 flex flex-col bg-surface outline-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid="step-indicator">
            {stepIndicator(step)}
          </p>
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="mt-0.5 text-lg font-semibold text-foreground outline-none"
          >
            {isFinal ? "Review & generate" : `Review the ${section!.label.toLowerCase()}`}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void handleClose()}
          disabled={disabled}
          aria-label="Save and close"
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {section ? (
            <>
              <p className="text-sm text-muted-foreground">{section.hint}</p>

              {sectionItems.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No {section.emptyNoun} yet.
                </p>
              )}

              <ul className="space-y-3">
                {sectionItems.map((item, index) => (
                  <li
                    key={item.id}
                    data-testid="sow-item"
                    data-source={item.source}
                    className={`rounded-md border border-border p-3 motion-safe:transition-opacity ${
                      item.included ? "bg-surface" : "bg-surface-muted opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={(event) => handleToggle(item.id, event.target.checked)}
                        aria-label={includeLabel(item.section, index, item.text)}
                        disabled={generating}
                        className="mt-2.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <AutoGrowTextarea
                          value={item.text}
                          label={`Text of ${section.noun} ${index + 1}`}
                          onChange={(text) => handleTextChange(item.id, text)}
                          onBlur={() => queue.schedule(item.id)}
                          autoFocus={focusItemId === item.id}
                          className={item.included ? "" : "text-muted-foreground line-through"}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ProvenanceBadges item={item} />
                          <div className="flex flex-wrap items-center gap-3">
                            <SaveState
                              entry={queue.entries[item.id]}
                              onRetry={() => void queue.retry(item.id)}
                              onKeepMine={() => void queue.retry(item.id)}
                              onUseTheirs={() => {
                                const theirs = conflictsRef.current.get(item.id);
                                queue.discard(item.id);
                                if (theirs) replaceItem(theirs);
                              }}
                            />
                            {item.source === "PM_EDITED" && item.agentOriginalText !== null && (
                              <button
                                type="button"
                                disabled={generating}
                                onClick={() =>
                                  void runItemAction(
                                    item.id,
                                    (v) => revertSowItemAction(projectId, item.id, v),
                                    "Reverted to the suggested wording."
                                  )
                                }
                                className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                Revert to suggestion
                              </button>
                            )}
                            {item.source === "PM_ADDED" && (
                              <button
                                type="button"
                                disabled={generating}
                                onClick={() => void handleDelete(item.id)}
                                aria-label={`Delete ${section.noun} ${index + 1}`}
                                className="text-xs font-medium text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                        {item.pendingAgentSuggestion && (
                          <div
                            data-testid="pending-suggestion"
                            className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm"
                          >
                            <p className="text-xs font-semibold text-foreground">Suggested change</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-foreground">{item.pendingAgentSuggestion}</p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                className="px-2 py-1 text-xs"
                                disabled={generating}
                                onClick={() =>
                                  void runItemAction(
                                    item.id,
                                    (v) => acceptSowSuggestionAction(projectId, item.id, v),
                                    "Suggested change accepted."
                                  )
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                disabled={generating}
                                onClick={() =>
                                  void runItemAction(
                                    item.id,
                                    (v) => dismissSowSuggestionAction(projectId, item.id, v),
                                    "Suggested change dismissed."
                                  )
                                }
                              >
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <Button type="button" variant="secondary" disabled={disabled} onClick={() => void handleAdd(section.key)}>
                Add new {section.noun}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The SOW will be written using only the included items below.
              </p>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Items per section</caption>
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Section</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Included</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Excluded</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Added</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Edited</th>
                    <th scope="col" className="py-2 pl-2"><span className="sr-only">Go to step</span></th>
                  </tr>
                </thead>
                <tbody>
                  {SOW_REVIEW_SECTIONS.map((s, index) => {
                    const counts = sectionCounts(items, s.key);
                    return (
                      <tr key={s.key} className="border-b border-border" data-testid={`summary-${s.key}`}>
                        <th scope="row" className="py-2 pr-3 font-medium text-foreground">{s.label}</th>
                        <td className="px-2 py-2">{counts.included}</td>
                        <td className="px-2 py-2">{counts.excluded}</td>
                        <td className="px-2 py-2">{counts.added}</td>
                        <td className="px-2 py-2">{counts.edited}</td>
                        <td className="py-2 pl-2 text-right">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void handleJump(index)}
                            aria-label={`Go to step ${index + 1}: ${s.label}`}
                            className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pendingSuggestions > 0 && (
                <p className="text-sm text-warning">
                  {pendingSuggestions} suggested {pendingSuggestions === 1 ? "change is" : "changes are"} still waiting
                  for you to accept or dismiss. They won&apos;t be applied unless you accept them.
                </p>
              )}
            </>
          )}

          {confirmMessage && (
            <div
              role="alertdialog"
              aria-label={confirmMessage}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{confirmMessage}</span>
              <span className="flex gap-2">
                <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={() => setConfirmMessage(null)}>
                  Stay here
                </Button>
                <Button type="button" className="px-3 py-1 text-xs" disabled={disabled} onClick={() => void handleNext(true)}>
                  Continue
                </Button>
              </span>
            </div>
          )}
          {blockedMessage && (
            <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
              {blockedMessage}
            </p>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => void handleClose()}>
          Save &amp; exit
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={disabled || step === 0} onClick={() => void handleBack()}>
            Back
          </Button>
          {isFinal ? (
            <Button type="button" disabled={disabled} onClick={() => void handleGenerate()}>
              Generate SOW
            </Button>
          ) : (
            <Button type="button" disabled={disabled} onClick={() => void handleNext()}>
              Next: {stepLabel(step + 1)}
            </Button>
          )}
        </div>
      </footer>

      <p role="status" aria-live="polite" className="sr-only" data-testid="sow-review-live">
        {live}
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="sow-review-save-live">
        {saveAnnouncement}
      </p>
    </div>,
    document.body
  );
}
