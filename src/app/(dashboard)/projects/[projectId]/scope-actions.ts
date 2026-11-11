"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject, CANNOT_EDIT_PROJECT_MESSAGE } from "@/lib/permissions";
import { isProjectCompleteInDb } from "@/lib/project/projectGuards";
import { getProjectContext } from "@/lib/projectContext";
import { appendScopeSummaryVersion, latestScopeSummary } from "@/lib/scopeSummary";
import { APPROVAL_ERROR_COPY } from "@/lib/commercial/approvalCopy";
import {
  ScopeSummaryAgentError,
  generateScopeSummary,
  mergeEarlierDocuments,
} from "@/services/agents/scope-summary-agent";
import type { ActionResult } from "@/types/approvals";

/**
 * FB-009 Scope summary actions that call the agent: regenerate from
 * everything known, and create v1 for a project set up before scope
 * summaries existed. Both append a version; nothing is overwritten. Each is
 * guarded by canEditProject and the project-complete lock.
 */

export interface ScopeAgentResultData {
  projectId: string;
  versionNumber: number;
}

async function guard(
  projectId: string
): Promise<{ userId: string } | ActionResult<ScopeAgentResultData>> {
  const session = await auth();
  const actor = session?.user ? { id: session.user.id, role: session.user.role } : null;
  if (!canEditProject(actor))
    return { ok: false, code: "FORBIDDEN", message: CANNOT_EDIT_PROJECT_MESSAGE };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { ok: false, code: "NOT_FOUND", message: "Project not found." };
  if (await isProjectCompleteInDb(projectId)) {
    return { ok: false, code: "PROJECT_COMPLETE", message: APPROVAL_ERROR_COPY.PROJECT_COMPLETE };
  }
  return { userId: actor!.id };
}

function agentFailure(error: unknown): ActionResult<ScopeAgentResultData> {
  if (error instanceof ScopeSummaryAgentError)
    return { ok: false, code: "VALIDATION", message: error.message };
  throw error;
}

/** A fresh Scope summary version drafted from the brief and every update. */
export async function regenerateScopeSummaryAction(
  projectId: string
): Promise<ActionResult<ScopeAgentResultData>> {
  const allowed = await guard(projectId);
  if ("ok" in allowed) return allowed;
  try {
    const context = await getProjectContext(projectId);
    const content = await generateScopeSummary(context.text, context.pmPerspective);
    const saved = await appendScopeSummaryVersion(projectId, content, {
      builtFromVersion: context.latestVersion,
      userId: allowed.userId,
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, data: { projectId, versionNumber: saved.versionNumber } };
  } catch (error) {
    return agentFailure(error);
  }
}

/**
 * "Create scope summary from these": v1 merged from a pre-FB-009 project's
 * Position Document and Draft Scope Document (their latest versions). Only
 * when the project has no Scope summary yet.
 */
export async function createScopeSummaryFromEarlierAction(
  projectId: string
): Promise<ActionResult<ScopeAgentResultData>> {
  const allowed = await guard(projectId);
  if ("ok" in allowed) return allowed;
  if (await latestScopeSummary(projectId)) {
    return { ok: false, code: "VALIDATION", message: "This project already has a scope summary." };
  }
  const earlier = await prisma.document.findMany({
    where: { projectId, type: { in: ["POSITION_DOCUMENT", "DRAFT_SCOPE_DOCUMENT"] } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const material = earlier
    .filter((d) => d.versions[0])
    .map(
      (d) =>
        `## ${d.type === "POSITION_DOCUMENT" ? "Position Document" : "Draft Scope Document"} (v${d.versions[0].versionNumber})\n${JSON.stringify(d.versions[0].content)}`
    )
    .join("\n\n");
  try {
    const context = await getProjectContext(projectId);
    const content = await mergeEarlierDocuments(
      material || "(none)",
      context.text,
      context.pmPerspective
    );
    const saved = await appendScopeSummaryVersion(projectId, content, {
      builtFromVersion: context.latestVersion,
      userId: allowed.userId,
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, data: { projectId, versionNumber: saved.versionNumber } };
  } catch (error) {
    return agentFailure(error);
  }
}
