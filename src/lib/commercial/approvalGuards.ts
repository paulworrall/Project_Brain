import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { lockedMessage } from "@/lib/commercial/approvalCopy";
import type { CommercialDocumentTypeName } from "@/types/approvals";

export type ApprovalDb = Prisma.TransactionClient | PrismaClient;

/** Thrown by the editable guards when the client has approved the document. */
export class CommercialLockedError extends Error {
  readonly code = "LOCKED" as const;
  constructor(
    readonly documentType: CommercialDocumentTypeName,
    message: string
  ) {
    super(message);
    this.name = "CommercialLockedError";
  }
}

/** The project's active approval of one document type, with its version number — or null. */
export async function findActiveApproval(
  db: ApprovalDb,
  projectId: string,
  documentType: CommercialDocumentTypeName
) {
  return db.commercialApproval.findFirst({
    where: { projectId, documentType, revokedAt: null },
    include: {
      estimateVersion: { select: { versionNumber: true } },
      sowVersion: { select: { versionNumber: true } },
    },
  });
}

async function assertEditable(db: ApprovalDb, projectId: string, type: CommercialDocumentTypeName) {
  const approval = await findActiveApproval(db, projectId, type);
  if (!approval) return;
  const versionNumber = (approval.estimateVersion ?? approval.sowVersion)?.versionNumber ?? 0;
  throw new CommercialLockedError(
    type,
    lockedMessage(versionNumber, approval.clientApprovedOn.toISOString())
  );
}

/**
 * Server-side locks. Disabled buttons are a convenience; these are the real
 * lock — call them from EVERY action that creates or changes an estimate or
 * SOW (and, for long-running work, again inside the writing transaction).
 */
export function assertEstimateEditable(projectId: string, db: ApprovalDb = prisma): Promise<void> {
  return assertEditable(db, projectId, "ESTIMATE");
}

export function assertSowEditable(projectId: string, db: ApprovalDb = prisma): Promise<void> {
  return assertEditable(db, projectId, "SOW");
}

/** Convenience for actions with their own result shape: the lock's message, or null if editable. */
export async function lockMessage(
  type: CommercialDocumentTypeName,
  projectId: string,
  db: ApprovalDb = prisma
): Promise<string | null> {
  try {
    await (type === "ESTIMATE"
      ? assertEstimateEditable(projectId, db)
      : assertSowEditable(projectId, db));
    return null;
  } catch (error) {
    if (error instanceof CommercialLockedError) return error.message;
    throw error;
  }
}
