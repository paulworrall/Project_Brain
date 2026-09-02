"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Generic keyboard-operable expander built on native <details>/<summary> —
 * gives Enter/Space toggling for free, with an explicit aria-expanded kept in
 * sync so assistive tech has an unambiguous state to announce.
 */
export function Disclosure({ summary, children, defaultOpen = false, className = "" }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  return (
    <details open={open} onToggle={handleToggle} className={className}>
      <summary
        aria-expanded={open}
        className="cursor-pointer list-none text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
