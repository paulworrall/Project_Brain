import type { PhaseDefinition } from "@/lib/projectPhases";

/** Informative placeholder for a 5D phase that hasn't been built yet. Read-only: no controls, no data. */
export function PhaseComingSoon({ phase }: { phase: PhaseDefinition }) {
  return (
    <section aria-labelledby="phase-heading" className="space-y-5 rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 id="phase-heading" tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
          {phase.label} — {phase.verbs[0]} · {phase.verbs[1]}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{phase.purpose}</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What this phase will cover
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
          {phase.activities.map((activity) => (
            <li key={activity}>{activity}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliverable</h3>
        <p className="mt-1 text-sm text-foreground">{phase.deliverable}</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          You&rsquo;re done when
        </h3>
        <p className="mt-1 text-sm text-foreground">{phase.exitGate}</p>
      </div>

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Coming soon — this phase is being designed
      </p>
    </section>
  );
}
