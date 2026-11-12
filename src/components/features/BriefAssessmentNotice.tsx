import Link from "next/link";
import type { BriefAssessment } from "@/types/intake";

/**
 * FB-009 D: the Intake Agent's judgement of the brief (complete / partial /
 * thin), shown two ways — always as icon + text, never colour alone:
 * - `BriefAssessmentLabel` on the Scope summary card;
 * - `BriefAssessmentCallout` at the top of the Brief step: a complete brief's
 *   fast path (Confirm scope is the primary action) or a thin brief's warning
 *   with its reasons (the clarification email is the primary action).
 */

const LABEL: Record<BriefAssessment["level"], string> = {
  complete: "Brief looks complete",
  partial: "Brief is partly complete",
  thin: "Brief is thin",
};

const ICON: Record<BriefAssessment["level"], string> = { complete: "✓", partial: "◐", thin: "!" };

export function BriefAssessmentLabel({ assessment }: { assessment: BriefAssessment | null }) {
  if (!assessment) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
      <span aria-hidden="true" className="font-medium">
        {ICON[assessment.level]}
      </span>
      <span className="font-medium">{LABEL[assessment.level]}</span>
      {assessment.level !== "complete" && assessment.reasons.length > 0 && (
        <span className="text-muted-foreground">— {assessment.reasons.join("; ")}</span>
      )}
    </p>
  );
}

export function BriefAssessmentCallout({
  projectId,
  assessment,
  scopeConfirmed,
  readOnly,
}: {
  projectId: string;
  assessment: BriefAssessment | null;
  scopeConfirmed: boolean;
  readOnly: boolean;
}) {
  if (!assessment || scopeConfirmed || readOnly) return null;
  if (assessment.level === "complete") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border border-l-4 border-l-navy bg-surface px-4 py-3">
        <p className="text-sm text-foreground">
          <span aria-hidden="true">✓ </span>This brief looks complete. You can confirm the scope
          now.
        </p>
        <Link
          href={`/projects/${projectId}/brief#scope-gate`}
          className="inline-flex min-h-11 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Confirm scope
        </Link>
      </div>
    );
  }
  if (assessment.level === "thin") {
    return (
      <div
        role="note"
        className="space-y-2 border border-warning bg-warning-bg px-4 py-3 text-sm text-foreground"
      >
        <p className="font-medium">
          <span aria-hidden="true">! </span>This brief is thin. Clarify it with the client before
          scoping.
        </p>
        {assessment.reasons.length > 0 && (
          <ul className="list-disc pl-5">
            {assessment.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <Link
          href={`/projects/${projectId}/brief#clarification-email`}
          className="inline-flex min-h-11 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Open the clarification email
        </Link>
      </div>
    );
  }
  return null;
}
