import type { PositionDocumentFields } from "@/types/intake";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";

// Lists longer than this show only the first VISIBLE_ITEM_COUNT by default,
// with a "Show N more" <details> toggle for the rest — keeps the primary
// "what we know" narrative scannable without hiding anything permanently.
const TRUNCATE_THRESHOLD = 6;
const VISIBLE_ITEM_COUNT = 5;

function TruncatedList({ items }: { items: string[] }) {
  if (items.length <= TRUNCATE_THRESHOLD) {
    return (
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }

  const visible = items.slice(0, VISIBLE_ITEM_COUNT);
  const rest = items.slice(VISIBLE_ITEM_COUNT);

  return (
    <>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
        {visible.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-primary">
          Show {rest.length} more
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {rest.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

export interface PositionDocumentViewProps {
  fields: PositionDocumentFields;
  /**
   * Version history only: show the AI-generated open questions older
   * versions still carry. The live workspace never shows them — it has the
   * key-details checklist instead.
   */
  showLegacyQuestions?: boolean;
}

/**
 * The general brief context — everything the Intake Agent captured, kept
 * even when it doesn't fit a key attribute. The key attributes themselves
 * (and brief readiness) live in the "What We Need to Find Out" checklist (BriefChecklist).
 */
export function PositionDocumentView({ fields, showLegacyQuestions = false }: PositionDocumentViewProps) {
  const legacyQuestions = fields.whatWeNeedToFindOut ?? [];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Other details from the brief</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Everything else captured from the brief and later inputs.
        </p>
        {fields.whatWeKnow.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing captured yet.</p>
        ) : (
          <Disclosure
            className="mt-2"
            summary={`${fields.whatWeKnow.length} detail${fields.whatWeKnow.length === 1 ? "" : "s"} captured`}
          >
            <dl className="space-y-2">
              {fields.whatWeKnow.map((item, i) => (
                <div key={i}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.topic}
                  </dt>
                  <dd className="text-sm text-foreground">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        )}
      </Card>

      {showLegacyQuestions && legacyQuestions.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground">Earlier open questions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-generated when this version was saved — no longer produced or updated. What we
            need to find out is now the fixed key-details checklist.
          </p>
          <TruncatedList items={legacyQuestions} />
        </Card>
      )}

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
