import { prisma } from "@/lib/prisma";
import type { Prisma, SowSectionItem } from "@/generated/prisma/client";
import { planExtractionMerge, type SowExtractionResult } from "@/lib/sowItemsMerge";
import {
  SOW_ITEM_MAX_LENGTH,
  clampStep,
  includedItems,
  type SowItemDto,
  type SowSectionKey,
} from "@/lib/sowReview";
import type { SOWValidatedLists } from "@/types/sow";

/**
 * The database layer for the PM's SOW content review. Every query is scoped by
 * projectId (an item id alone never selects a row), and every item write
 * states the version it read — a stale write comes back as a conflict instead
 * of silently overwriting someone else's edit.
 */

export function toSowItemDto(row: SowSectionItem): SowItemDto {
  return {
    id: row.id,
    section: row.section,
    text: row.text,
    agentOriginalText: row.agentOriginalText,
    source: row.source,
    included: row.included,
    position: row.position,
    isNewSinceLastReview: row.isNewSinceLastReview,
    pendingAgentSuggestion: row.pendingAgentSuggestion,
    version: row.version,
  };
}

export async function listSowItems(projectId: string): Promise<SowItemDto[]> {
  const rows = await prisma.sowSectionItem.findMany({
    where: { projectId },
    orderBy: [{ section: "asc" }, { position: "asc" }],
  });
  return rows.map(toSowItemDto);
}

export interface SowReviewStateDto {
  currentStep: number;
  inProgress: boolean;
  lastCompletedAt: Date | null;
}

export async function getSowReviewState(projectId: string): Promise<SowReviewStateDto> {
  const state = await prisma.sowReviewState.findUnique({ where: { projectId } });
  return {
    currentStep: clampStep(state?.currentStep ?? 0),
    inProgress: state?.inProgress ?? false,
    lastCompletedAt: state?.lastCompletedAt ?? null,
  };
}

export async function setSowReviewStep(projectId: string, step: number): Promise<number> {
  const currentStep = clampStep(step);
  await prisma.sowReviewState.upsert({
    where: { projectId },
    update: { currentStep },
    create: { projectId, currentStep },
  });
  return currentStep;
}

/**
 * Applies an extraction result under the merge rules (planExtractionMerge):
 * creates new items, updates only what the rules allow, deletes nothing. Also
 * marks a review in progress at step 0 so reopening resumes instead of
 * re-extracting. All-or-nothing.
 */
export async function applySowExtraction(
  projectId: string,
  userId: string | null,
  existing: readonly SowItemDto[],
  result: SowExtractionResult
): Promise<{ created: number; updated: number; unknownItemIds: string[] }> {
  const plan = planExtractionMerge(existing, result);

  await prisma.$transaction(async (tx) => {
    for (const create of plan.creates) {
      await tx.sowSectionItem.create({
        data: {
          projectId,
          section: create.section,
          text: create.text,
          agentOriginalText: create.text,
          source: "AGENT",
          included: true,
          position: create.position,
          isNewSinceLastReview: create.isNewSinceLastReview,
          createdById: userId,
          updatedById: userId,
        },
      });
    }
    for (const update of plan.updates) {
      await tx.sowSectionItem.updateMany({
        // projectId in the filter: an id from the agent can never reach another project's item.
        where: { id: update.itemId, projectId },
        data: { ...update.data, version: { increment: 1 }, updatedById: userId },
      });
    }
    await tx.sowReviewState.upsert({
      where: { projectId },
      update: { inProgress: true, currentStep: 0 },
      create: { projectId, inProgress: true, currentStep: 0 },
    });
  });

  return { created: plan.creates.length, updated: plan.updates.length, unknownItemIds: plan.unknownItemIds };
}

export type SowItemResult =
  | { ok: true; item: SowItemDto }
  | { ok: false; code: "conflict" | "not_found" | "invalid"; message: string; item?: SowItemDto };

type Compute = (row: SowSectionItem) => { data: Prisma.SowSectionItemUpdateManyMutationInput } | { error: string };

const CONFLICT_MESSAGE = "Someone else changed this item while you were editing it.";

/** Read -> check version -> compute -> versioned write. The one path every item edit goes through. */
async function guardedUpdate(
  projectId: string,
  itemId: string,
  expectedVersion: number,
  userId: string | null,
  compute: Compute
): Promise<SowItemResult> {
  const row = await prisma.sowSectionItem.findFirst({ where: { id: itemId, projectId } });
  if (!row) return { ok: false, code: "not_found", message: "This item no longer exists." };
  if (row.version !== expectedVersion) {
    return { ok: false, code: "conflict", message: CONFLICT_MESSAGE, item: toSowItemDto(row) };
  }

  const computed = compute(row);
  if ("error" in computed) return { ok: false, code: "invalid", message: computed.error, item: toSowItemDto(row) };

  const { count } = await prisma.sowSectionItem.updateMany({
    where: { id: itemId, projectId, version: expectedVersion },
    data: { ...computed.data, version: { increment: 1 }, updatedById: userId },
  });
  const fresh = await prisma.sowSectionItem.findFirst({ where: { id: itemId, projectId } });
  if (!fresh) return { ok: false, code: "not_found", message: "This item no longer exists." };
  if (count === 0) return { ok: false, code: "conflict", message: CONFLICT_MESSAGE, item: toSowItemDto(fresh) };
  return { ok: true, item: toSowItemDto(fresh) };
}

export interface SowItemPatch {
  text?: string;
  included?: boolean;
}

/**
 * Edit an item's text and/or inclusion. Editing an AGENT item's text makes it
 * PM_EDITED (the agent's wording is kept for "Revert to suggestion"); putting
 * the agent's exact wording back makes it AGENT again.
 */
export function saveSowItem(
  projectId: string,
  itemId: string,
  patch: SowItemPatch,
  expectedVersion: number,
  userId: string | null
): Promise<SowItemResult> {
  return guardedUpdate(projectId, itemId, expectedVersion, userId, (row) => {
    const data: Prisma.SowSectionItemUpdateManyMutationInput = {};

    if (patch.text !== undefined) {
      const text = patch.text.trim();
      if (text.length > SOW_ITEM_MAX_LENGTH) {
        return { error: `Keep each item under ${SOW_ITEM_MAX_LENGTH} characters.` };
      }
      // A PM-added item may sit blank while it's being written (blanks are ignored everywhere);
      // an agent-suggested one can't be emptied — exclude it instead.
      if (!text && row.source !== "PM_ADDED") {
        return { error: "An item can't be empty — untick it to exclude it instead." };
      }
      if (text !== row.text) {
        data.text = text;
        if (row.source === "AGENT" && text !== (row.agentOriginalText ?? row.text)) {
          data.source = "PM_EDITED";
          data.agentOriginalText = row.agentOriginalText ?? row.text;
        } else if (row.source === "PM_EDITED" && row.agentOriginalText !== null && text === row.agentOriginalText) {
          data.source = "AGENT";
        }
      }
    }
    if (patch.included !== undefined && patch.included !== row.included) {
      data.included = patch.included;
    }
    return { data };
  });
}

/** Restore the agent's last-proposed wording on an edited item. */
export function revertSowItem(
  projectId: string,
  itemId: string,
  expectedVersion: number,
  userId: string | null
): Promise<SowItemResult> {
  return guardedUpdate(projectId, itemId, expectedVersion, userId, (row) => {
    if (row.source !== "PM_EDITED" || row.agentOriginalText === null) {
      return { error: "There's no suggestion to revert to for this item." };
    }
    return { data: { text: row.agentOriginalText, source: "AGENT" } };
  });
}

/**
 * Accept the agent's proposed change to a PM-authored item. On an edited item
 * the text becomes the agent's wording again (so it's an agent item); an item
 * the PM added keeps its source.
 */
export function acceptSowSuggestion(
  projectId: string,
  itemId: string,
  expectedVersion: number,
  userId: string | null
): Promise<SowItemResult> {
  return guardedUpdate(projectId, itemId, expectedVersion, userId, (row) => {
    if (!row.pendingAgentSuggestion) return { error: "There's no suggested change on this item." };
    const data: Prisma.SowSectionItemUpdateManyMutationInput = {
      text: row.pendingAgentSuggestion,
      pendingAgentSuggestion: null,
    };
    if (row.source === "PM_EDITED") {
      data.source = "AGENT";
      data.agentOriginalText = row.pendingAgentSuggestion;
    }
    return { data };
  });
}

export function dismissSowSuggestion(
  projectId: string,
  itemId: string,
  expectedVersion: number,
  userId: string | null
): Promise<SowItemResult> {
  return guardedUpdate(projectId, itemId, expectedVersion, userId, (row) => {
    if (!row.pendingAgentSuggestion) return { error: "There's no suggested change on this item." };
    return { data: { pendingAgentSuggestion: null } };
  });
}

/** A new PM_ADDED item, appended to the section. Starts blank; blanks are ignored until written. */
export async function addSowItem(
  projectId: string,
  section: SowSectionKey,
  userId: string | null
): Promise<SowItemDto> {
  const last = await prisma.sowSectionItem.findFirst({
    where: { projectId, section },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const row = await prisma.sowSectionItem.create({
    data: {
      projectId,
      section,
      text: "",
      source: "PM_ADDED",
      included: true,
      position: (last?.position ?? -1) + 1,
      createdById: userId,
      updatedById: userId,
    },
  });
  return toSowItemDto(row);
}

export type SowDeleteResult =
  | { ok: true }
  | { ok: false; code: "conflict" | "not_found" | "forbidden"; message: string; item?: SowItemDto };

/** Only PM-added items can be deleted; agent-originated ones can only be excluded. */
export async function deleteSowItem(
  projectId: string,
  itemId: string,
  expectedVersion: number
): Promise<SowDeleteResult> {
  const row = await prisma.sowSectionItem.findFirst({ where: { id: itemId, projectId } });
  if (!row) return { ok: true }; // already gone — the goal state
  if (row.source !== "PM_ADDED") {
    return {
      ok: false,
      code: "forbidden",
      message: "Suggested items can't be deleted — untick it to exclude it instead.",
      item: toSowItemDto(row),
    };
  }
  if (row.version !== expectedVersion) {
    return { ok: false, code: "conflict", message: CONFLICT_MESSAGE, item: toSowItemDto(row) };
  }
  const { count } = await prisma.sowSectionItem.deleteMany({
    where: { id: itemId, projectId, source: "PM_ADDED", version: expectedVersion },
  });
  if (count === 0) {
    const fresh = await prisma.sowSectionItem.findFirst({ where: { id: itemId, projectId } });
    return fresh
      ? { ok: false, code: "conflict", message: CONFLICT_MESSAGE, item: toSowItemDto(fresh) }
      : { ok: true };
  }
  return { ok: true };
}

/** The validated lists composition may use: included, non-blank items, in position order. */
export function validatedListsFromItems(items: readonly SowItemDto[]): SOWValidatedLists {
  const texts = (section: SowSectionKey) => includedItems(items, section).map((i) => i.text);
  return {
    deliverables: texts("DELIVERABLES"),
    services: texts("SERVICES"),
    assumptions: texts("ASSUMPTIONS"),
    outOfScope: texts("OUT_OF_SCOPE"),
    risks: texts("RISKS"),
  };
}

/** After a SOW is generated: the review is done; "new since last review" flags are cleared. */
export async function completeSowReview(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.sowSectionItem.updateMany({
    where: { projectId, isNewSinceLastReview: true },
    data: { isNewSinceLastReview: false },
  });
  await tx.sowReviewState.upsert({
    where: { projectId },
    update: { inProgress: false, currentStep: 0, lastCompletedAt: new Date() },
    create: { projectId, inProgress: false, currentStep: 0, lastCompletedAt: new Date() },
  });
}
