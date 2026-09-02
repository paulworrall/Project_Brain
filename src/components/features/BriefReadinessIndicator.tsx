import type { FoundationCategoryResult } from "@/lib/foundationDetails";
import { ReadinessStrip } from "@/components/ui/ReadinessStrip";

// Phase-1-flavored wrapper around the generic ReadinessStrip — same visual
// strip every phase header uses, just built from Foundation Details
// categories instead of stage completion. The Foundation Details list itself
// is still the source of truth for state per category; this is just a
// compact at-a-glance summary.
export function BriefReadinessIndicator({ categories }: { categories: FoundationCategoryResult[] }) {
  const confirmedCount = categories.filter((category) => category.state === "confirmed").length;

  return (
    <ReadinessStrip
      segments={categories.map((category) => ({
        key: category.key,
        label: category.label,
        state: category.state,
      }))}
      headline={`Brief Readiness — ${confirmedCount} of ${categories.length} confirmed`}
      ariaLabel={`Brief readiness: ${confirmedCount} of ${categories.length} foundation details confirmed`}
    />
  );
}
