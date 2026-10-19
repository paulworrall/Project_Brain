"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  approveVersion,
  revertApproval,
  undoApproval,
  type ApprovalResultData,
} from "@/lib/commercial/approvalService";
import type { ActionResult } from "@/types/approvals";

/**
 * Thin wrappers: session -> actor, run the rule in approvalService, then
 * invalidate the project page so badges, locks, stage status and the approved
 * documents panel all update together.
 */

async function actor() {
  const session = await auth();
  return session?.user?.id ? { id: session.user.id, role: session.user.role } : null;
}

function refresh(result: ActionResult<ApprovalResultData>): ActionResult<ApprovalResultData> {
  if (result.ok) {
    revalidatePath(`/projects/${result.data.projectId}`, "layout");
    revalidatePath(`/projects/${result.data.projectId}/estimates`, "layout");
  }
  return result;
}

export async function approveEstimateVersion(input: unknown): Promise<ActionResult<ApprovalResultData>> {
  return refresh(await approveVersion(prisma, await actor(), "ESTIMATE", input));
}

export async function approveSowVersion(input: unknown): Promise<ActionResult<ApprovalResultData>> {
  return refresh(await approveVersion(prisma, await actor(), "SOW", input));
}

export async function undoApprovalAction(input: unknown): Promise<ActionResult<ApprovalResultData>> {
  return refresh(await undoApproval(prisma, await actor(), input));
}

export async function revertApprovalAction(input: unknown): Promise<ActionResult<ApprovalResultData>> {
  return refresh(await revertApproval(prisma, await actor(), input));
}
