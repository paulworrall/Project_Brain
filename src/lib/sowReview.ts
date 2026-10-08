/**
 * Shared (client + server) definitions for the PM's SOW content review: the
 * section list, the item shape, and the pure rules the overlay and the server
 * actions both lean on. No DB or React imports — keep it that way.
 *
 * The five sections are fixed for this build, but everything reads them from
 * SOW_REVIEW_SECTIONS so the list could later be driven by the client's SOW
 * template (templates carry no section structure today — only extracted text).
 */

export type SowSectionKey = "DELIVERABLES" | "SERVICES" | "ASSUMPTIONS" | "OUT_OF_SCOPE" | "RISKS";
export type SowItemSourceKey = "AGENT" | "PM_EDITED" | "PM_ADDED";

export interface SowReviewSectionDef {
  key: SowSectionKey;
  /** Step heading and step-indicator label. */
  label: string;
  /** Singular noun, used in checkbox labels ("Include deliverable 3: …"). */
  noun: string;
  /** Lower-case plural for the empty-section confirm ("No risks listed — continue?"). */
  emptyNoun: string;
  /** One line of guidance under the step heading. */
  hint: string;
  /** Deliverables can't be empty; every other section may be. */
  required: boolean;
}

export const SOW_REVIEW_SECTIONS: readonly SowReviewSectionDef[] = [
  {
    key: "DELIVERABLES",
    label: "Deliverables",
    noun: "deliverable",
    emptyNoun: "deliverables",
    hint: "What we will hand over to the client. Untick anything that shouldn't appear in the SOW.",
    required: true,
  },
  {
    key: "SERVICES",
    label: "Services",
    noun: "service",
    emptyNoun: "services",
    hint: "The services and capabilities that will deliver the work.",
    required: false,
  },
  {
    key: "ASSUMPTIONS",
    label: "Assumptions",
    noun: "assumption",
    emptyNoun: "assumptions",
    hint: "What the scope and price depend on being true.",
    required: false,
  },
  {
    key: "OUT_OF_SCOPE",
    label: "Out of Scope",
    noun: "out-of-scope item",
    emptyNoun: "out-of-scope items",
    hint: "What is deliberately not included.",
    required: false,
  },
  {
    key: "RISKS",
    label: "Risks",
    noun: "risk",
    emptyNoun: "risks",
    hint: "Open questions and risks worth stating to the client.",
    required: false,
  },
];

/** Five section steps plus the final "Review & generate". */
export const SOW_REVIEW_STEP_COUNT = SOW_REVIEW_SECTIONS.length + 1;
export const SOW_REVIEW_FINAL_STEP = SOW_REVIEW_SECTIONS.length;
export const SOW_ITEM_MAX_LENGTH = 2000;

/** What the client sees of one item. `version` is the optimistic-concurrency token. */
export interface SowItemDto {
  id: string;
  section: SowSectionKey;
  text: string;
  agentOriginalText: string | null;
  source: SowItemSourceKey;
  included: boolean;
  position: number;
  isNewSinceLastReview: boolean;
  pendingAgentSuggestion: string | null;
  version: number;
}

/** What an item action returns, as the overlay sees it (the server's SowItemResult fits this). */
export type SowItemResultLike =
  | { ok: true; item: SowItemDto }
  | { ok: false; code: string; message: string; item?: SowItemDto };

/** A frozen item as stored on SOWVersion.itemsSnapshot. */
export interface SowItemSnapshot {
  section: SowSectionKey;
  text: string;
  position: number;
  source: SowItemSourceKey;
}

export function sectionDef(key: SowSectionKey): SowReviewSectionDef {
  const def = SOW_REVIEW_SECTIONS.find((s) => s.key === key);
  if (!def) throw new Error(`Unknown SOW section: ${key}`);
  return def;
}

export function stepLabel(step: number): string {
  return step >= SOW_REVIEW_SECTIONS.length ? "Review & generate" : SOW_REVIEW_SECTIONS[step].label;
}

/** "Step 2 of 6: Services" */
export function stepIndicator(step: number): string {
  return `Step ${step + 1} of ${SOW_REVIEW_STEP_COUNT}: ${stepLabel(step)}`;
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), SOW_REVIEW_FINAL_STEP);
}

/** A PM-added item that was created but never given any text. Ignored everywhere. */
export function isBlankItem(item: { text: string }): boolean {
  return item.text.trim().length === 0;
}

export function itemsInSection<T extends { section: SowSectionKey; position: number }>(
  items: readonly T[],
  section: SowSectionKey
): T[] {
  return items.filter((i) => i.section === section).sort((a, b) => a.position - b.position);
}

/** Included, non-blank items of a section, in position order. */
export function includedItems<T extends { section: SowSectionKey; position: number; included: boolean; text: string }>(
  items: readonly T[],
  section: SowSectionKey
): T[] {
  return itemsInSection(items, section).filter((i) => i.included && !isBlankItem(i));
}

export interface SectionCounts {
  included: number;
  excluded: number;
  added: number;
  edited: number;
}

export function sectionCounts(items: readonly SowItemDto[], section: SowSectionKey): SectionCounts {
  const real = itemsInSection(items, section).filter((i) => !isBlankItem(i));
  return {
    included: real.filter((i) => i.included).length,
    excluded: real.filter((i) => !i.included).length,
    added: real.filter((i) => i.source === "PM_ADDED").length,
    edited: real.filter((i) => i.source === "PM_EDITED").length,
  };
}

export type StepAdvance =
  | { kind: "ok" }
  | { kind: "blocked"; message: string }
  | { kind: "confirm"; message: string };

/**
 * Whether the PM may move on from a section step. Deliverables needs at least
 * one included item; the other sections may be empty, but the PM is asked to
 * confirm ("No risks listed — continue?").
 */
export function checkStepAdvance(section: SowSectionKey, items: readonly SowItemDto[]): StepAdvance {
  const def = sectionDef(section);
  if (includedItems(items, section).length > 0) return { kind: "ok" };
  if (def.required) {
    return {
      kind: "blocked",
      message: `Include at least one ${def.noun} to continue — a SOW needs something to deliver.`,
    };
  }
  return { kind: "confirm", message: `No ${def.emptyNoun} listed — continue?` };
}

/** First few words of an item, for accessible labels. */
export function firstWords(text: string, count = 6): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const head = words.slice(0, count).join(" ");
  return words.length > count ? `${head}…` : head;
}

/** The per-item accessible label for the include checkbox. */
export function includeLabel(section: SowSectionKey, indexInSection: number, text: string): string {
  const preview = firstWords(text);
  return `Include ${sectionDef(section).noun} ${indexInSection + 1}${preview ? `: ${preview}` : ""}`;
}

/** The frozen set a SOW version records: included, non-blank items only. */
export function snapshotItems(items: readonly SowItemDto[]): SowItemSnapshot[] {
  return SOW_REVIEW_SECTIONS.flatMap((s) =>
    includedItems(items, s.key).map((i) => ({
      section: i.section,
      text: i.text,
      position: i.position,
      source: i.source,
    }))
  );
}

/** Normalised form used to spot "the same item" across wordings. */
export function normaliseItemText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
