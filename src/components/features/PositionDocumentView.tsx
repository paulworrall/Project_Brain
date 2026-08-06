import type { PositionDocumentFields } from "@/types/intake";
import { Card } from "@/components/ui/Card";

const NOT_SPECIFIED = "Not specified in brief";

export function PositionDocumentView({ fields }: { fields: PositionDocumentFields }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Primary Contact</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {fields.primaryContactName ?? NOT_SPECIFIED}
          {fields.primaryContactEmail ? ` — ${fields.primaryContactEmail}` : ""}
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">What We Know</h3>
        {fields.whatWeKnow.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{NOT_SPECIFIED}</p>
        ) : (
          <dl className="mt-2 space-y-2">
            {fields.whatWeKnow.map((item, i) => (
              <div key={i}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.topic}
                </dt>
                <dd className="text-sm text-foreground">{item.detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">What We Need to Find Out</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Genuine gaps — the brief never addresses these.
        </p>
        {fields.whatWeNeedToFindOut.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None identified.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
            {fields.whatWeNeedToFindOut.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Client-Flagged Open Items</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The client themselves flagged these as still deciding.
        </p>
        {fields.clientFlaggedOpenItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None flagged.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
            {fields.clientFlaggedOpenItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
