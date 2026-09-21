import type { FoundationCategoryResult, FoundationState } from "@/lib/foundationDetails";
import type { PositionDocumentFields } from "@/types/intake";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";

// Icon + text together carry the state — never colour alone.
const STATE_ICON: Record<FoundationState, string> = {
  confirmed: "✓",
  partial: "◐",
  missing: "○",
};

const STATE_LABEL: Record<FoundationState, string> = {
  confirmed: "Confirmed",
  partial: "Partial",
  missing: "Missing",
};

const STATE_TEXT_CLASS: Record<FoundationState, string> = {
  confirmed: "text-success",
  partial: "text-warning",
  missing: "text-muted-foreground",
};

export interface FoundationDetailsBlockProps {
  categories: FoundationCategoryResult[];
  additionalDetails?: PositionDocumentFields["whatWeKnow"];
}

export function FoundationDetailsBlock({ categories, additionalDetails = [] }: FoundationDetailsBlockProps) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">Foundation Details</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        What estimation, resourcing, and SOW drafting need before work can proceed.
      </p>
      <dl className="mt-3 space-y-3">
        {categories.map((category) => (
          <div key={category.key} className="flex items-start gap-2">
            <span aria-hidden="true" className={`mt-0.5 shrink-0 text-sm ${STATE_TEXT_CLASS[category.state]}`}>
              {STATE_ICON[category.state]}
            </span>
            <div className="min-w-0">
              <dt className="flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>{category.label}</span>
                <span className={`text-[10px] font-semibold normal-case ${STATE_TEXT_CLASS[category.state]}`}>
                  {STATE_LABEL[category.state]}
                </span>
              </dt>
              <dd className="text-sm text-foreground">
                {category.state === "missing" ? (
                  <span className="italic text-muted-foreground">{category.placeholder}</span>
                ) : (
                  category.value
                )}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {additionalDetails.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <Disclosure
            summary={`${additionalDetails.length} additional detail${additionalDetails.length === 1 ? "" : "s"} captured`}
          >
            <dl className="space-y-2">
              {additionalDetails.map((item, i) => (
                <div key={i}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.topic}
                  </dt>
                  <dd className="text-sm text-foreground">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </div>
      )}
    </Card>
  );
}
