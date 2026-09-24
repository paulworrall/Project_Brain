import { PM_PERSPECTIVE_FIELDS } from "@/lib/pmPerspective";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";

/** Every configured field, with content only for the ids given — same shape getPmPerspective returns. */
export function pmPerspectiveView(
  content: Record<string, { content: string; updatedAt?: Date; updatedByName?: string }> = {}
): PmPerspectiveFieldView[] {
  return PM_PERSPECTIVE_FIELDS.map((field) => {
    const entry = content[field.id];
    return {
      ...field,
      content: entry?.content ?? "",
      updatedAt: entry ? (entry.updatedAt ?? new Date("2026-09-23T10:00:00Z")) : null,
      updatedByName: entry ? (entry.updatedByName ?? "Pat PM") : null,
    };
  });
}
