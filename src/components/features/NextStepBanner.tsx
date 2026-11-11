import Link from "next/link";
import type { NextAction } from "@/lib/nextAction";

/**
 * FB-009 C: directly under the stepper — always exactly one next action, with
 * a title, a one-line reason and one primary button (a link to where the
 * action is done). Derived by deriveNextAction on every render, so it updates
 * after every action without a reload; ProjectShell announces changes.
 */
export function NextStepBanner({ action }: { action: NextAction }) {
  return (
    <section
      aria-labelledby="next-step-title"
      className="flex flex-wrap items-center justify-between gap-3 border border-border border-l-4 border-l-navy bg-surface px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {action.id === "complete" ? "Done" : "Next step"}
        </p>
        <h2 id="next-step-title" className="text-base font-medium text-foreground">
          {action.title}
        </h2>
        <p className="text-sm text-muted-foreground">{action.reason}</p>
      </div>
      <Link
        href={action.button.href}
        className="inline-flex min-h-11 shrink-0 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        {action.button.label}
      </Link>
    </section>
  );
}
