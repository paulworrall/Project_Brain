"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { formatUkDateTime } from "@/lib/updateLabel";
import type { VersionEntry } from "@/lib/updateVersions";

/** One version of the brief (v1 the brief, then each update), as getVersionHistory returns it. */
export type VersionView = Omit<VersionEntry, "content">;

const SOURCE_LABEL: Record<VersionView["source"], string> = {
  CLIENT: "Client",
  INTERNAL_TEAM: "Internal team",
};

/** Notes longer than this are clamped to two lines with "Show more". */
const LONG_NOTE_CHARS = 120;

function VersionRow({ version }: { version: VersionView }) {
  const [expanded, setExpanded] = useState(false);
  const noteId = useId();
  const isLong = (version.summary?.length ?? 0) > LONG_NOTE_CHARS;
  // An untitled update's label already carries its date.
  const showDate = !version.label.startsWith("Update — ");

  return (
    <li className="py-3 text-xs text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p>
          <span className="font-semibold text-primary">
            {version.versionNumber ? `v${version.versionNumber}` : "—"}
          </span>{" "}
          {version.label}
          {showDate && <span className="text-muted-foreground"> · {formatUkDateTime(version.createdAt)}</span>}
        </p>
        <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {SOURCE_LABEL[version.source]}
        </span>
      </div>
      {version.detail && <p className="mt-0.5 text-muted-foreground">{version.detail}</p>}
      {version.summary && (
        <div className="mt-1">
          <p id={noteId} className={expanded ? "text-foreground/80" : "line-clamp-2 text-foreground/80"}>
            {version.summary}
          </p>
          {isLong && (
            <button
              type="button"
              className="mt-0.5 font-medium text-primary hover:underline"
              aria-expanded={expanded}
              aria-controls={noteId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
      {version.changeSummary && (
        <p className="mt-1 text-[11px] text-muted-foreground">Changed: {version.changeSummary}</p>
      )}
    </li>
  );
}

/**
 * The full version history (v1 the brief, then each update, newest first) in
 * a side drawer, closed by default — opened from the compact "Latest: … · View
 * history" line under the update form so the list no longer clutters the
 * page. A modal dialog: focus moves in on open (the close button), Tab stays
 * inside, Escape or the backdrop closes it, and focus returns to the trigger.
 */
export function VersionHistoryDrawer({
  versions,
  isOpen,
  onClose,
}: {
  /** Oldest first; shown newest first. */
  versions: VersionView[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(containerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-5 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <ul aria-label="Version history" className="mt-3 divide-y divide-border">
          {[...versions].reverse().map((version) => (
            <VersionRow key={version.id} version={version} />
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
