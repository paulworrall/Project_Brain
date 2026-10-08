"use server";

import { auth } from "@/lib/auth";
import { assembleSowContext } from "@/lib/sow-context";
import { checkSowPreconditions, type SowPreconditionFailure } from "@/lib/sowPreconditions";
import {
  acceptSowSuggestion,
  addSowItem,
  applySowExtraction,
  deleteSowItem,
  dismissSowSuggestion,
  getSowReviewState,
  listSowItems,
  revertSowItem,
  saveSowItem,
  setSowReviewStep,
  type SowDeleteResult,
  type SowItemPatch,
  type SowItemResult,
} from "@/lib/sowItems";
import { SowAgentError } from "@/services/agents/sow-agent";
import { extractSowItems } from "@/services/agents/sow-extraction-agent";
import { SOW_REVIEW_SECTIONS, type SowItemDto, type SowSectionKey } from "@/lib/sowReview";

/**
 * Server actions behind the SOW content review overlay. Step 1 of the split
 * (extraction) and the PM's edits live here; step 4 (composition) is
 * generateSowAction. Every call is scoped to a projectId at the query layer.
 */

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export interface StartSowReviewResult extends Partial<SowPreconditionFailure> {
  items?: SowItemDto[];
  currentStep?: number;
}

/**
 * Opens the review for a project. Refused (with the same brief-gate payload as
 * generating) until the project is ready for a SOW. If a review is already in
 * progress (the PM did "Save & exit"), resumes it as-is — no new extraction.
 * Otherwise runs extraction: on a first generation it proposes AGENT items for
 * each section; on a regeneration it passes the existing items (with ids) and
 * merges only genuinely new items and proposed changes under the merge rules
 * (planExtractionMerge). Nothing is ever deleted.
 */
export async function startSowReviewAction(projectId: string): Promise<StartSowReviewResult> {
  const preconditions = await checkSowPreconditions(projectId);
  if (!preconditions.ok) return preconditions.failure;

  const state = await getSowReviewState(projectId);
  if (!state.inProgress) {
    const [existing, { narrativeContext }, userId] = await Promise.all([
      listSowItems(projectId),
      assembleSowContext(projectId),
      currentUserId(),
    ]);
    try {
      const result = await extractSowItems(narrativeContext, existing);
      const applied = await applySowExtraction(projectId, userId, existing, result);
      if (applied.unknownItemIds.length > 0) {
        console.warn(
          `SOW extraction for project ${projectId} referenced ${applied.unknownItemIds.length} unknown item id(s); ignored.`
        );
      }
    } catch (error) {
      if (error instanceof SowAgentError) return { message: error.message };
      throw error;
    }
  }

  const [items, fresh] = await Promise.all([listSowItems(projectId), getSowReviewState(projectId)]);
  return { items, currentStep: fresh.currentStep };
}

/** Where the PM got to, so "Save & exit" resumes at the right step. */
export async function saveSowReviewStepAction(projectId: string, step: number): Promise<void> {
  await setSowReviewStep(projectId, step);
}

export async function saveSowItemAction(
  projectId: string,
  itemId: string,
  patch: SowItemPatch,
  expectedVersion: number
): Promise<SowItemResult> {
  return saveSowItem(projectId, itemId, patch, expectedVersion, await currentUserId());
}

export async function revertSowItemAction(
  projectId: string,
  itemId: string,
  expectedVersion: number
): Promise<SowItemResult> {
  return revertSowItem(projectId, itemId, expectedVersion, await currentUserId());
}

export async function acceptSowSuggestionAction(
  projectId: string,
  itemId: string,
  expectedVersion: number
): Promise<SowItemResult> {
  return acceptSowSuggestion(projectId, itemId, expectedVersion, await currentUserId());
}

export async function dismissSowSuggestionAction(
  projectId: string,
  itemId: string,
  expectedVersion: number
): Promise<SowItemResult> {
  return dismissSowSuggestion(projectId, itemId, expectedVersion, await currentUserId());
}

export async function addSowItemAction(projectId: string, section: SowSectionKey): Promise<SowItemDto | null> {
  if (!SOW_REVIEW_SECTIONS.some((s) => s.key === section)) return null;
  return addSowItem(projectId, section, await currentUserId());
}

export async function deleteSowItemAction(
  projectId: string,
  itemId: string,
  expectedVersion: number
): Promise<SowDeleteResult> {
  return deleteSowItem(projectId, itemId, expectedVersion);
}
