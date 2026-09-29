import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { ReadinessStrip } from "@/components/ui/ReadinessStrip";

// Phase-1-flavored wrapper around the generic ReadinessStrip — same visual
// strip every phase header uses, one segment per REQUIRED key attribute
// (src/lib/briefAttributes.ts). A detail counts as soon as it's captured —
// from the brief, an update or a PM's edit. The "What We Need to Find Out" checklist (BriefChecklist) is the full view.
export function BriefReadinessIndicator({ completeness }: { completeness: BriefCompleteness }) {
  const required = completeness.attributes.filter((attribute) => attribute.required);
  const capturedCount = required.filter((attribute) => attribute.status === "confirmed").length;

  return (
    <ReadinessStrip
      segments={required.map((attribute) => ({
        key: attribute.id,
        label: attribute.label,
        state: attribute.status,
      }))}
      headline={`Brief Readiness — ${capturedCount} of ${required.length} captured`}
      ariaLabel={`Brief readiness: ${capturedCount} of ${required.length} required key details captured`}
    />
  );
}
