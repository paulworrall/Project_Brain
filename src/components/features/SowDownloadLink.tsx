"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const LINK_CLASS = "inline-block text-xs font-medium text-primary hover:underline";

/**
 * A SOW download link with a guard: when the version is out of date
 * (`staleWarning`, from getSowChangeStatus via changedDownloadWarning), clicking
 * asks first — "Review it first, or download anyway?" — in a dialog that
 * traps focus and returns it to the link on close. Otherwise a plain link.
 */
export function SowDownloadLink({
  href,
  staleWarning,
  children,
  className = LINK_CLASS,
}: {
  href: string;
  staleWarning: string | null;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!staleWarning) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <>
      <button type="button" className={`${className} text-left`} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Modal isOpen={open} title="This SOW doesn't include the latest updates" onClose={() => setOpen(false)}>
        <p className="text-sm text-foreground">{staleWarning} Review it first, or download anyway?</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={() => setOpen(false)}>
            Review it first
          </Button>
          <a
            href={href}
            onClick={() => setOpen(false)}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Download anyway
          </a>
        </div>
      </Modal>
    </>
  );
}
