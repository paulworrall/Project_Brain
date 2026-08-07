import type { DeliverablesServicesDocument } from "@/types/deliverables-services";
import { SERVICE_ROWS } from "@/types/deliverables-services";
import { Card } from "@/components/ui/Card";
import { EditableOtherLabel } from "./EditableOtherLabel";

export function DeliverablesServicesDocumentView({
  projectId,
  document,
  readOnly = false,
}: {
  projectId: string;
  document: DeliverablesServicesDocument;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Deliverables</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {document.deliverables.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Services</h3>
        <div className="mt-3 space-y-3">
          {SERVICE_ROWS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{document.services[key].involvement}</p>
            </div>
          ))}
          <div>
            {readOnly ? (
              <p className="text-sm font-semibold text-foreground">{document.services.other.label}</p>
            ) : (
              <EditableOtherLabel projectId={projectId} label={document.services.other.label} />
            )}
            <p className="text-sm text-muted-foreground">{document.services.other.involvement}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Open Questions / Risks</h3>
        {document.openQuestionsRisks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None raised.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
            {document.openQuestionsRisks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-warning bg-warning-bg p-5">
        <h3 className="text-sm font-semibold text-warning">Outstanding Gaps Carried Forward</h3>
        {document.outstandingGapsCarriedForward.length === 0 ? (
          <p className="mt-2 text-sm text-warning">None — all prior gaps were resolved.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
            {document.outstandingGapsCarriedForward.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
