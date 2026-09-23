import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { ReadinessStrip } from "@/components/ui/ReadinessStrip";

// Phase-1-flavored wrapper around the generic ReadinessStrip — same visual
// strip every phase header uses, one segment per REQUIRED key attribute
// (src/lib/briefAttributes.ts). "Confirmed" means PM-confirmed; AI
// suggestions never count. The Key details panel is the full view.
export function BriefReadinessIndicator({ completeness }: { completeness: BriefCompleteness }) {
  const required = completeness.attributes.filter((attribute) => attribute.required);
  const confirmedCount = required.filter((attribute) => attribute.status === "confirmed").length;

  return (
    <ReadinessStrip
      segments={required.map((attribute) => ({
        key: attribute.id,
        label: attribute.label,
        state: attribute.status,
      }))}
      headline={`Brief Readiness — ${confirmedCount} of ${required.length} confirmed`}
      ariaLabel={`Brief readiness: ${confirmedCount} of ${required.length} required key details confirmed`}
    />
  );
}
