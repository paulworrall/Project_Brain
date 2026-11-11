"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addChecklistItem,
  confirmScope,
  editScopeSummary,
  setClarificationSent,
  type ClarificationSentResultData,
  type ScopeSummaryResultData,
  reopenScope,
  setChecklistItemStep,
  updateSpecialistInput,
  type ChecklistItemResultData,
  type ScopeResultData,
  type SpecialistInputResultData,
} from "@/lib/project/stepService";
import type { ActionResult } from "@/types/approvals";

/**
 * FB-008 step actions. Thin wrappers, as in approval-actions.ts: session ->
 * actor, run the rule in lib/project/stepService.ts (which checks
 * canEditProject and the project-complete lock), then refresh the whole
 * project layout so the stepper, readiness lists and summaries update together.
 */

async function actor() {
  const session = await auth();
  return session?.user?.id ? { id: session.user.id, role: session.user.role } : null;
}

function refresh<T extends { projectId: string }>(result: ActionResult<T>): ActionResult<T> {
  if (result.ok) {
    revalidatePath(`/projects/${result.data.projectId}`, "layout");
    revalidatePath("/"); // FB-009 F: the pipeline home page
  }
  return result;
}

export async function confirmScopeAction(input: unknown): Promise<ActionResult<ScopeResultData>> {
  return refresh(await confirmScope(prisma, await actor(), input));
}

export async function reopenScopeAction(input: unknown): Promise<ActionResult<ScopeResultData>> {
  return refresh(await reopenScope(prisma, await actor(), input));
}

export async function updateSpecialistInputAction(
  input: unknown
): Promise<ActionResult<SpecialistInputResultData>> {
  return refresh(await updateSpecialistInput(prisma, await actor(), input));
}

export async function setChecklistItemStepAction(
  input: unknown
): Promise<ActionResult<ChecklistItemResultData>> {
  return refresh(await setChecklistItemStep(prisma, await actor(), input));
}

export async function addChecklistItemAction(
  input: unknown
): Promise<ActionResult<ChecklistItemResultData>> {
  return refresh(await addChecklistItem(prisma, await actor(), input));
}

export async function editScopeSummaryAction(
  input: unknown
): Promise<ActionResult<ScopeSummaryResultData>> {
  return refresh(await editScopeSummary(prisma, await actor(), input));
}

export async function setClarificationSentAction(
  input: unknown
): Promise<ActionResult<ClarificationSentResultData>> {
  return refresh(await setClarificationSent(prisma, await actor(), input));
}
