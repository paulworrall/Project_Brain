"use client";

import Link from "next/link";
import type { NextAction, NextActionId } from "@/lib/nextAction";
import { formatApprovalDate } from "@/lib/commercial/approvalCopy";
import { CopyQuestionsButton } from "./CopyQuestionsButton";

/** What the complete-project success block needs (FB-012). */
export interface CompletionSummary {
  /** YYYY-MM-DD the client approved the SOW. */
  approvedOn: string;
  versionNumber: number;
  sowHref: string;
  estimateHref: string | null;
}

/** The one lock line, shown once under the success block. */
export const LOCKED_LINE = "Locked. Changes will need a change request (coming soon).";

/**
 * FB-009 C, restyled in FB-012: directly under the stepper, inside the same
 * bordered container — "where you are" above, "what to do now" below. Always
 * exactly one next action: a small "Next step" label, a 20px title, one line
 * of reason and the page's one primary button (a link to where the action is
 * done; it stacks below on narrow screens). Derived by deriveNextAction on
 * every render, so it updates after every action without a reload;
 * ProjectShell announces changes. The rules are unchanged — only the tone is
 * presentation: amber when the next step is waiting on something or needs a
 * look, green when the project is complete, neutral otherwise.
 */
export type BannerTone = "neutral" | "amber" | "success";

const AMBER_ACTIONS: readonly NextActionId[] = [
  "add_msa_rate_card",
  "resolve_questions",
  "confirm_latest_scope",
  "wait_specialists",
  "review_estimate",
];

export function bannerTone(id: NextActionId): BannerTone {
  if (id === "complete") return "success";
  return AMBER_ACTIONS.includes(id) ? "amber" : "neutral";
}

const TONE_CLASSES: Record<BannerTone, string> = {
  neutral: "bg-surface border-l-navy",
  amber: "bg-tint border-l-amber",
  success: "bg-success-tint border-l-navy",
};

export function NextStepBanner({
  action,
  openQuestionsText = "",
  completion = null,
}: {
  action: NextAction;
  /** Set once the project is complete: the banner becomes one green success block with the downloads. */
  completion?: CompletionSummary | null;
  /** The numbered open-questions list, for the "Copy questions" button (FB-011). */
  openQuestionsText?: string;
}) {
  const copies = action.button.action === "copy_questions" && openQuestionsText !== "";
  const tone = bannerTone(action.id);
  if (action.id === "complete" && completion) {
    return (
      <section
        aria-labelledby="next-step-title"
        data-tone="success"
        className="space-y-2 border-l-4 border-l-navy bg-success-tint px-4 py-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="next-step-title" className="text-banner font-medium text-foreground">
            <span aria-hidden="true">✓ </span>SOW approved · {formatApprovalDate(completion.approvedOn)} · v
            {completion.versionNumber}
          </h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={completion.sowHref}
              className="inline-flex min-h-11 items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Download SOW
            </a>
            {completion.estimateHref && (
              <a
                href={completion.estimateHref}
                className="inline-flex min-h-11 items-center justify-center border border-primary bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-cream"
              >
                Download estimate
              </a>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground">{LOCKED_LINE}</p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="next-step-title"
      data-tone={tone}
      className={`flex flex-col gap-3 border-l-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${TONE_CLASSES[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {action.id === "complete" ? (
            <>
              <span aria-hidden="true">✓ </span>Done
            </>
          ) : (
            "Next step"
          )}
        </p>
        <h2 id="next-step-title" className="text-banner font-medium text-foreground">
          {action.title}
        </h2>
        <p className="text-sm text-foreground">{action.reason}</p>
      </div>
      {copies ? (
        <CopyQuestionsButton
          text={openQuestionsText}
          label={action.button.label}
          variant="primary"
          className="shrink-0"
        />
      ) : (
        <Link
          href={action.button.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {action.button.label}
        </Link>
      )}
    </section>
  );
}
