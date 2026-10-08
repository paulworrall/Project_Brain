import { SOW_REVIEW_SECTIONS, normaliseItemText, type SowItemDto, type SowSectionKey } from "@/lib/sowReview";

/**
 * What the extraction agent returns, in both modes. First generation: only
 * `newItems`. Regeneration: only genuinely new items, plus proposed rewordings
 * of existing items by id.
 */
export interface SowExtractionResult {
  newItems: { section: SowSectionKey; text: string }[];
  changes: { itemId: string; text: string }[];
}

export interface PlannedCreate {
  section: SowSectionKey;
  text: string;
  position: number;
  isNewSinceLastReview: boolean;
}

export interface PlannedUpdate {
  itemId: string;
  /** Only the fields to change; anything absent is left alone. */
  data: Partial<{ text: string; agentOriginalText: string; pendingAgentSuggestion: string }>;
}

export interface MergePlan {
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  /** Agent change ids that matched no existing item — dropped, reported for logging. */
  unknownItemIds: string[];
}

/**
 * The regeneration merge rules, as a pure function (no DB, no clock) so they
 * are enforceable by tests rather than by prompting:
 *
 *  - Never deletes anything, never touches `included` (an excluded item stays
 *    excluded; an included one stays included).
 *  - PM_EDITED / PM_ADDED text is never overwritten: an agent change to one
 *    lands in `pendingAgentSuggestion` for the PM to accept or dismiss.
 *  - AGENT items the PM hasn't touched take the agent's revised wording.
 *  - New agent items are appended, flagged "new since last review" — but only
 *    when this is a regeneration; on a first generation they're just
 *    "Suggested".
 *  - Agent ids that don't belong to this project's items are dropped (the
 *    caller passes only this project's items), never trusted.
 */
export function planExtractionMerge(
  existing: readonly SowItemDto[],
  result: SowExtractionResult
): MergePlan {
  const isRegeneration = existing.length > 0;
  const byId = new Map(existing.map((i) => [i.id, i]));
  const updates = new Map<string, PlannedUpdate>();
  const unknownItemIds: string[] = [];

  for (const change of result.changes) {
    const item = byId.get(change.itemId);
    if (!item) {
      unknownItemIds.push(change.itemId);
      continue;
    }
    const proposed = change.text.trim();
    if (!proposed || normaliseItemText(proposed) === normaliseItemText(item.text)) continue;

    if (item.source === "AGENT") {
      // Untouched by the PM: take the revised wording (inclusion unchanged).
      updates.set(item.id, { itemId: item.id, data: { text: proposed, agentOriginalText: proposed } });
      continue;
    }
    // PM-authored text is never overwritten. Skip a proposal that repeats the
    // agent's own earlier wording (the PM already moved away from it) or one
    // already pending.
    if (item.source === "PM_EDITED" && item.agentOriginalText && normaliseItemText(item.agentOriginalText) === normaliseItemText(proposed)) {
      continue;
    }
    if (item.pendingAgentSuggestion && normaliseItemText(item.pendingAgentSuggestion) === normaliseItemText(proposed)) {
      continue;
    }
    updates.set(item.id, { itemId: item.id, data: { pendingAgentSuggestion: proposed } });
  }

  // Next free position per section, and the wordings already present (so a
  // re-proposed existing item isn't added again).
  const nextPosition = new Map<SowSectionKey, number>();
  const seen = new Map<SowSectionKey, Set<string>>();
  for (const { key } of SOW_REVIEW_SECTIONS) {
    const inSection = existing.filter((i) => i.section === key);
    nextPosition.set(key, inSection.reduce((max, i) => Math.max(max, i.position), -1) + 1);
    seen.set(
      key,
      new Set(
        inSection.flatMap((i) =>
          [i.text, i.agentOriginalText, i.pendingAgentSuggestion]
            .filter((t): t is string => !!t)
            .map(normaliseItemText)
        )
      )
    );
  }

  const creates: PlannedCreate[] = [];
  for (const candidate of result.newItems) {
    const text = candidate.text.trim();
    const known = seen.get(candidate.section);
    if (!text || !known) continue;
    const key = normaliseItemText(text);
    if (known.has(key)) continue;
    known.add(key);
    const position = nextPosition.get(candidate.section) ?? 0;
    nextPosition.set(candidate.section, position + 1);
    creates.push({ section: candidate.section, text, position, isNewSinceLastReview: isRegeneration });
  }

  return { creates, updates: [...updates.values()], unknownItemIds };
}
