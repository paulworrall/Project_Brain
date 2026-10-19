/** Quiet, non-blocking note shown on a phase whose predecessor isn't Complete. Tabs are never locked. */
export function PreviousPhaseNotice({ previousPhaseLabel }: { previousPhaseLabel: string }) {
  return (
    <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
      {previousPhaseLabel} isn&rsquo;t complete yet — you can still look ahead.
    </p>
  );
}
