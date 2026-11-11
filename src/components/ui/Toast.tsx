"use client";

import type { ReactNode } from "react";

/**
 * A small, non-blocking notification pinned to the bottom of the screen,
 * announced to screen readers through a polite live region. Dismissible;
 * it never takes focus.
 */
export function Toast({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Notification"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start justify-between gap-3 border-2 border-navy border-l-8 border-l-orange bg-surface p-3 text-sm text-foreground sm:inset-x-auto sm:right-4"
    >
      <div className="min-w-0">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}
