import { describeValues } from "@/lib/keyDetailsContext";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { SCOPE_SECTIONS, type ScopeSectionId, type ScopeSummaryContent } from "@/types/scope";

/**
 * FB-009: what the Scope summary card shows, section by section — the stored
 * content plus the key details shown read-only in their sections, and the
 * required key details still outstanding under Open questions. Pure.
 */

export interface ScopeViewItem {
  text: string;
  /** "key_detail": from the key-details record (edit it under What We Need to Find Out). */
  source: "summary" | "key_detail";
}

export interface ScopeViewSection {
  id: ScopeSectionId;
  label: string;
  items: ScopeViewItem[];
  /** The stored field this section edits, if any. */
  editable: boolean;
}

export function buildScopeView(
  content: ScopeSummaryContent | null,
  keyDetails: Pick<BriefCompleteness, "attributes" | "requiredOutstanding">
): ScopeViewSection[] {
  return SCOPE_SECTIONS.map((section) => {
    const items: ScopeViewItem[] = [];
    for (const id of section.keyDetailIds) {
      const attribute = keyDetails.attributes.find((a) => a.id === id);
      const text = attribute?.current ? describeValues(id, attribute.current.values) : "";
      if (attribute && text)
        items.push({ text: `${attribute.label}: ${text}`, source: "key_detail" });
    }
    if (section.id === "openQuestions") {
      for (const attribute of keyDetails.requiredOutstanding) {
        items.push({ text: `${attribute.label} — ${attribute.question}`, source: "key_detail" });
      }
    }
    if (content && section.stored) {
      const value = content[section.stored];
      const stored = typeof value === "string" ? (value ? [value] : []) : value;
      items.push(...stored.map((text) => ({ text, source: "summary" as const })));
    }
    return { id: section.id, label: section.label, items, editable: section.stored !== null };
  });
}

/** Every open question: stored ones plus the required key details still outstanding. */
export function openQuestionCount(
  content: ScopeSummaryContent | null,
  keyDetails: Pick<BriefCompleteness, "requiredOutstanding">
): number {
  return (content?.openQuestions.length ?? 0) + keyDetails.requiredOutstanding.length;
}
