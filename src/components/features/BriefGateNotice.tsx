"use client";

import type { BriefAttributeCompleteness, BriefCompleteness } from "@/lib/briefCompleteness";
import { KeyAttributeRow, STATUS_LABEL } from "./KeyAttributesPanel";

/**
 * Shown where a gated step is refused (today: Generate SOW) — lists exactly
 * which required key details are missing or partial, each with its own
 * fill-in form, so the PM can fix them right here without hunting for them.
 */
export function BriefGateAlert({
  projectId,
  outstanding,
  onDismiss,
}: {
  projectId: string;
  outstanding: BriefAttributeCompleteness[];
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-warning bg-warning-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            We can&apos;t generate the SOW yet
          </h4>
          <p className="text-xs text-muted-foreground">
            {outstanding.length === 1
              ? "This key detail needs"
              : `These ${outstanding.length} key details need`}{" "}
            to be confirmed first:{" "}
            {outstanding
              .map((a) => `${a.label} (${STATUS_LABEL[a.status].toLowerCase()})`)
              .join(", ")}
            .
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Dismiss
          </button>
        )}
      </div>
      <ul className="space-y-3 rounded-md bg-surface p-3">
        {outstanding.map((attribute) => (
          <KeyAttributeRow
            key={attribute.id}
            projectId={projectId}
            attribute={attribute}
            idPrefix="sow-gate"
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * For projects that moved past Phase 1 before key details were tracked:
 * they aren't locked out of anything they've reached, just warned about
 * what's missing (and a SOW can't be generated until it's confirmed).
 */
export function BriefCompletenessWarning({ completeness }: { completeness: BriefCompleteness }) {
  if (completeness.warnings.length === 0) {
    return null;
  }
  return (
    <div
      role="status"
      className="rounded-md border border-warning bg-warning-bg p-3 text-xs text-foreground"
    >
      <p className="font-semibold">Some key details for this project haven&apos;t been confirmed</p>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {completeness.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="mt-1 text-muted-foreground">
        Nothing is locked, but a SOW can&apos;t be generated until they&apos;re confirmed under Key
        details in Phase 1.
      </p>
    </div>
  );
}
