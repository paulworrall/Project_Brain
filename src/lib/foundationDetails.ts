import type { PositionDocumentFields } from "@/types/intake";

// The five categories estimation, resourcing, and SOW drafting need before
// work can proceed — display-layer grouping only. The Intake Agent still
// extracts free-text topic/detail pairs into `whatWeKnow`; this module buckets
// those pairs (plus Project.kickOffDate/targetCompletionDate and the
// extracted primary contact) into Foundation categories, it does not change
// what gets captured.
//
// "Client Name" means the name of the person managing this project on the
// client side (primaryContactName) — the project's commercial/governance
// anchor — not the client company's name. There is deliberately only one
// place this is captured and shown; it is not duplicated as a separate
// "Primary Contact" concept.
export type FoundationCategoryKey =
  | "clientName"
  | "problemObjective"
  | "timeline"
  | "budget"
  | "scope";

export type FoundationState = "confirmed" | "partial" | "missing";

export interface FoundationCategoryResult {
  key: FoundationCategoryKey;
  label: string;
  state: FoundationState;
  value: string | null;
  placeholder: string;
}

export interface FoundationDetailsResult {
  categories: FoundationCategoryResult[];
  secondaryWhatWeKnow: PositionDocumentFields["whatWeKnow"];
}

const LABELS: Record<FoundationCategoryKey, string> = {
  clientName: "Client Name",
  problemObjective: "Problem / Objective",
  timeline: "Timeline",
  budget: "Budget & commercial shape",
  scope: "Scope",
};

const PLACEHOLDER = "Not yet provided — ask in first client discussion";

type KeywordCategoryKey = "problemObjective" | "budget" | "scope";

const KEYWORD_PATTERNS: Record<KeywordCategoryKey | "timeline", RegExp> = {
  problemObjective:
    /objective|problem|goal|purpose|background|business context|challenge|opportunity/i,
  timeline: /timeline|deadline|start date|kick.?off|launch|milestone|schedule|due date|delivery date/i,
  budget:
    /budget|pricing|fixed fee|\bt&m\b|time and materials|retainer|commercial model|\bcost\b|\bfee\b|spend/i,
  scope: /\bscope\b|channel|deliverable|capabilit|workstream|feature|requirement/i,
};

const CLIENT_NAME_FLAG_PATTERN =
  /\bcontact\b|point of contact|stakeholder|client lead|project owner|client-side lead/i;

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function findFlagged(
  pattern: RegExp,
  whatWeNeedToFindOut: string[],
  clientFlaggedOpenItems: string[]
): string | null {
  return (
    clientFlaggedOpenItems.find((text) => pattern.test(text)) ??
    whatWeNeedToFindOut.find((text) => pattern.test(text)) ??
    null
  );
}

/**
 * Derives Foundation Details state from today's data — the free-text
 * `whatWeKnow` topic/detail pairs, the extracted primary contact, and
 * Project.kickOffDate/targetCompletionDate (already stored, just not
 * previously threaded into this view). No schema or agent change.
 */
export function deriveFoundationDetails(
  positionDocument: PositionDocumentFields | null,
  kickOffDate: Date | null,
  targetCompletionDate: Date | null
): FoundationDetailsResult {
  const whatWeKnow = positionDocument?.whatWeKnow ?? [];
  const whatWeNeedToFindOut = positionDocument?.whatWeNeedToFindOut ?? [];
  const clientFlaggedOpenItems = positionDocument?.clientFlaggedOpenItems ?? [];
  const usedIndices = new Set<number>();

  function matchWhatWeKnow(pattern: RegExp): string[] {
    const matches: string[] = [];
    whatWeKnow.forEach((item, index) => {
      if (!usedIndices.has(index) && pattern.test(item.topic)) {
        usedIndices.add(index);
        matches.push(item.detail);
      }
    });
    return matches;
  }

  const primaryContactName = positionDocument?.primaryContactName ?? null;
  const primaryContactEmail = positionDocument?.primaryContactEmail ?? null;

  let clientNameCategory: FoundationCategoryResult;
  if (primaryContactName) {
    clientNameCategory = {
      key: "clientName",
      label: LABELS.clientName,
      state: "confirmed",
      value: primaryContactEmail ? `${primaryContactName} — ${primaryContactEmail}` : primaryContactName,
      placeholder: PLACEHOLDER,
    };
  } else {
    const flagged = findFlagged(CLIENT_NAME_FLAG_PATTERN, whatWeNeedToFindOut, clientFlaggedOpenItems);
    clientNameCategory = {
      key: "clientName",
      label: LABELS.clientName,
      state: flagged ? "partial" : "missing",
      value: flagged ? `Flagged as open: ${flagged}` : null,
      placeholder: PLACEHOLDER,
    };
  }

  function deriveKeywordCategory(key: KeywordCategoryKey): FoundationCategoryResult {
    const pattern = KEYWORD_PATTERNS[key];
    const matches = matchWhatWeKnow(pattern);
    if (matches.length > 0) {
      return {
        key,
        label: LABELS[key],
        state: "confirmed",
        value: matches.join(" · "),
        placeholder: PLACEHOLDER,
      };
    }
    const flagged = findFlagged(pattern, whatWeNeedToFindOut, clientFlaggedOpenItems);
    return {
      key,
      label: LABELS[key],
      state: flagged ? "partial" : "missing",
      value: flagged ? `Flagged as open: ${flagged}` : null,
      placeholder: PLACEHOLDER,
    };
  }

  const problemObjectiveCategory = deriveKeywordCategory("problemObjective");

  const timelineMatches = matchWhatWeKnow(KEYWORD_PATTERNS.timeline);
  const hasStart = kickOffDate !== null;
  const hasDeadline = targetCompletionDate !== null;
  let timelineCategory: FoundationCategoryResult;
  if (timelineMatches.length > 0) {
    timelineCategory = {
      key: "timeline",
      label: LABELS.timeline,
      state: "confirmed",
      value: timelineMatches.join(" · "),
      placeholder: PLACEHOLDER,
    };
  } else if (hasStart && hasDeadline) {
    timelineCategory = {
      key: "timeline",
      label: LABELS.timeline,
      state: "confirmed",
      value: `Start: ${formatDate(kickOffDate)} · Target completion: ${formatDate(targetCompletionDate)}`,
      placeholder: PLACEHOLDER,
    };
  } else if (hasStart || hasDeadline) {
    timelineCategory = {
      key: "timeline",
      label: LABELS.timeline,
      state: "partial",
      value: hasStart
        ? `Start: ${formatDate(kickOffDate as Date)} — target completion not yet set`
        : `Target completion: ${formatDate(targetCompletionDate as Date)} — start date not yet set`,
      placeholder: PLACEHOLDER,
    };
  } else {
    const flagged = findFlagged(KEYWORD_PATTERNS.timeline, whatWeNeedToFindOut, clientFlaggedOpenItems);
    timelineCategory = {
      key: "timeline",
      label: LABELS.timeline,
      state: flagged ? "partial" : "missing",
      value: flagged ? `Flagged as open: ${flagged}` : null,
      placeholder: PLACEHOLDER,
    };
  }

  const budgetCategory = deriveKeywordCategory("budget");
  const scopeCategory = deriveKeywordCategory("scope");

  const secondaryWhatWeKnow = whatWeKnow.filter((_, index) => !usedIndices.has(index));

  return {
    categories: [
      clientNameCategory,
      problemObjectiveCategory,
      timelineCategory,
      budgetCategory,
      scopeCategory,
    ],
    secondaryWhatWeKnow,
  };
}
