"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * FB-011: copies the open questions as a numbered list. A short visible
 * "Copied" confirmation, also announced to screen readers through a polite
 * live region that is always in the DOM (so the announcement is reliable).
 * The app never sends anything; the PM pastes the list into their own email.
 */
export function CopyQuestionsButton({
  text,
  label = "Copy questions",
  variant = "secondary",
  className = "text-xs",
}: {
  text: string;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [status, setStatus] = useState<{ kind: "copied" | "error"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ kind: "copied", text: "Copied" });
    } catch {
      setStatus({ kind: "error", text: "Couldn't copy the questions." });
    }
    timer.current = setTimeout(() => setStatus(null), 3000);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant={variant} className={className} onClick={() => void copy()}>
        {label}
      </Button>
      <span
        role={status?.kind === "error" ? "alert" : "status"}
        aria-live={status?.kind === "error" ? undefined : "polite"}
        className="text-xs text-foreground"
      >
        {status ? (
          <>
            {status.kind === "copied" && <span aria-hidden="true">✓ </span>}
            {status.text}
          </>
        ) : null}
      </span>
    </span>
  );
}
