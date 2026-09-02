import type { FoundationCategoryResult, FoundationState } from "@/lib/foundationDetails";
import { Card } from "@/components/ui/Card";

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

export function FoundationDetailsBlock({ categories }: { categories: FoundationCategoryResult[] }) {
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
    </Card>
  );
}
