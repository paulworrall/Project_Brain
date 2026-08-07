import type { DraftScopeDocument } from "@/types/triage";
import { Card } from "@/components/ui/Card";

export function DraftScopeDocumentView({ scope }: { scope: DraftScopeDocument }) {
  return (
    <div className="space-y-4">
      {scope.flaggedGaps.length > 0 && (
        <Card className="border-warning bg-warning-bg p-5">
          <h3 className="text-sm font-semibold text-warning">
            ⚠ Gaps Carried Forward for Specialists
          </h3>
          <p className="mt-1 text-xs text-warning">
            This draft proceeds despite these open items — review before committing to scope.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
            {scope.flaggedGaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Objectives</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {scope.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Deliverables</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {scope.deliverables.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {scope.milestones.map((m, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{m.name}</span>
              <span className="shrink-0 text-muted-foreground">{m.dueDate ?? "TBC"}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Roles &amp; Responsibilities</h3>
        <div className="mt-2 space-y-3">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contacts
            </h4>
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {scope.rolesAndResponsibilities.contacts.map((c, i) => (
                <li key={i}>
                  {c.name} — {c.role} ({c.organization === "AGENCY" ? "Agency" : "Client"})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Capabilities Needed
            </h4>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-foreground">
              {scope.rolesAndResponsibilities.capabilities.map((cap, i) => (
                <li key={i}>{cap}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Budget</h3>
        <p className="mt-1 text-sm text-foreground">{scope.budget.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {scope.budget.isConfirmed ? "Confirmed" : "Not yet confirmed"}
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Assumptions &amp; Constraints</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {scope.assumptionsAndConstraints.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
