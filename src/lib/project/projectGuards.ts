import { prisma } from "@/lib/prisma";
import { findActiveApproval, type ApprovalDb } from "@/lib/commercial/approvalGuards";
import { PROJECT_COMPLETE_MESSAGE } from "@/lib/projectSteps";

/** Thrown by assertProjectEditable once the project is complete (its SOW is client approved). */
export class ProjectCompleteError extends Error {
  readonly code = "PROJECT_COMPLETE" as const;
  constructor() {
    super(PROJECT_COMPLETE_MESSAGE);
    this.name = "ProjectCompleteError";
  }
}

/** True once the project's SOW is client approved (FB-005) — the end of the SOW journey. */
export async function isProjectCompleteInDb(
  projectId: string,
  db: ApprovalDb = prisma
): Promise<boolean> {
  return (await findActiveApproval(db, projectId, "SOW")) !== null;
}

/**
 * FB-008's shared server-side guard: every project mutation calls this (or
 * projectCompleteMessage) before writing. Disabled controls are a convenience;
 * this is the real lock.
 */
export async function assertProjectEditable(
  projectId: string,
  db: ApprovalDb = prisma
): Promise<void> {
  if (await isProjectCompleteInDb(projectId, db)) {
    throw new ProjectCompleteError();
  }
}

/** For actions with their own `{ message }` result shape: the lock message, or null if editable. */
export async function projectCompleteMessage(
  projectId: string,
  db: ApprovalDb = prisma
): Promise<string | null> {
  return (await isProjectCompleteInDb(projectId, db)) ? PROJECT_COMPLETE_MESSAGE : null;
}
