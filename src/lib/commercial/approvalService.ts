import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  canApprove,
  canRevertApproval,
  canUndoApproval,
  type ApprovalActor,
} from "@/lib/permissions";
import { findActiveApproval, type ApprovalDb } from "@/lib/commercial/approvalGuards";
import { documentLabel } from "@/lib/commercial/approvalCopy";
import {
  ApproveVersionSchema,
  RevertApprovalSchema,
  UndoApprovalSchema,
  fieldErrorsFrom,
  type ActionResult,
  type ApprovalErrorCode,
  type CommercialDocumentTypeName,
} from "@/types/approvals";

/**
 * The approval business rules, free of Next/auth so they can be tested against
 * the database directly. The server actions in approval-actions.ts are thin
 * wrappers (session -> actor, revalidatePath).
 */

export interface ApprovalResultData {
  approvalId: string;
  projectId: string;
  documentType: CommercialDocumentTypeName;
  versionNumber: number;
}

function fail(code: ApprovalErrorCode, message: string, fieldErrors?: Record<string, string>) {
  return { ok: false as const, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

class Abort extends Error {
  constructor(readonly result: ReturnType<typeof fail>) {
    super(result.message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Runs `work` in a transaction; an Abort inside it rolls back and becomes its failure result. */
async function inTransaction(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<ApprovalResultData>
): Promise<ActionResult<ApprovalResultData>> {
  try {
    return { ok: true, data: await db.$transaction(work) };
  } catch (error) {
    if (error instanceof Abort) return error.result;
    if (isUniqueViolation(error)) {
      // Two users approving at once: the partial unique indexes let exactly one in.
      return fail("ALREADY_APPROVED", "This document has already been approved.");
    }
    throw error;
  }
}

export async function approveVersion(
  db: PrismaClient,
  user: ApprovalActor | null,
  documentType: CommercialDocumentTypeName,
  rawInput: unknown
): Promise<ActionResult<ApprovalResultData>> {
  const parsed = ApproveVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(
      "VALIDATION",
      "Check the highlighted fields and try again.",
      fieldErrorsFrom(parsed.error)
    );
  }
  const input = parsed.data;
  if (!user || !canApprove(user)) {
    return fail("FORBIDDEN", "You don't have permission to record an approval.");
  }

  return inTransaction(db, async (tx) => {
    let projectId: string;
    let versionNumber: number;
    let fileBytes: Uint8Array;
    let sourceEstimateVersionId: string | null = null;

    if (documentType === "ESTIMATE") {
      const version = await tx.estimateVersion.findUnique({
        where: { id: input.versionId },
        select: {
          versionNumber: true,
          fileBytes: true,
          estimate: { select: { id: true, projectId: true } },
        },
      });
      if (!version)
        throw new Abort(
          fail("VALIDATION", "That estimate version no longer exists.", {
            versionId: "Version not found.",
          })
        );
      const latest = await tx.estimateVersion.findFirst({
        where: { estimateId: version.estimate.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      if (latest?.versionNumber !== version.versionNumber) {
        throw new Abort(
          fail("NOT_LATEST_VERSION", "Only the latest version of an estimate can be approved.")
        );
      }
      projectId = version.estimate.projectId;
      versionNumber = version.versionNumber;
      fileBytes = version.fileBytes;
    } else {
      const version = await tx.sOWVersion.findUnique({
        where: { id: input.versionId },
        select: {
          versionNumber: true,
          fileBytes: true,
          sourceEstimateVersionId: true,
          sow: { select: { id: true, projectId: true } },
        },
      });
      if (!version)
        throw new Abort(
          fail("VALIDATION", "That SOW version no longer exists.", {
            versionId: "Version not found.",
          })
        );
      const latest = await tx.sOWVersion.findFirst({
        where: { sowId: version.sow.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      if (latest?.versionNumber !== version.versionNumber) {
        throw new Abort(fail("NOT_LATEST_VERSION", "Only the latest SOW version can be approved."));
      }
      projectId = version.sow.projectId;
      versionNumber = version.versionNumber;
      fileBytes = version.fileBytes;
      sourceEstimateVersionId = version.sourceEstimateVersionId;

      const approvedEstimate = await findActiveApproval(tx, projectId, "ESTIMATE");
      if (!approvedEstimate) {
        throw new Abort(fail("ESTIMATE_NOT_APPROVED", "Approve the estimate first."));
      }
      if (approvedEstimate.estimateVersionId !== sourceEstimateVersionId) {
        throw new Abort(
          fail(
            "SOW_SOURCE_MISMATCH",
            "This SOW wasn't generated from the approved estimate version. Regenerate the SOW first."
          )
        );
      }
    }

    // Friendly pre-check; the partial unique indexes remain the real guarantee.
    if (await findActiveApproval(tx, projectId, documentType)) {
      throw new Abort(
        fail(
          "ALREADY_APPROVED",
          `This project already has an approved ${documentLabel(documentType)}.`
        )
      );
    }

    const created = await tx.commercialApproval.create({
      data: {
        projectId,
        documentType,
        estimateVersionId: documentType === "ESTIMATE" ? input.versionId : null,
        sowVersionId: documentType === "SOW" ? input.versionId : null,
        clientApprovedOn: new Date(`${input.clientApprovedOn}T00:00:00.000Z`),
        clientApproverName: input.clientApproverName,
        reference: input.reference ? input.reference : null,
        fileSha256: sha256(fileBytes),
        recordedByUserId: user.id,
      },
      select: { id: true },
    });
    return { approvalId: created.id, projectId, documentType, versionNumber };
  });
}

type RevokeKind = "UNDO" | "ADMIN_REVERT";

async function revoke(
  tx: Prisma.TransactionClient,
  approvalId: string,
  user: ApprovalActor,
  kind: RevokeKind,
  reason: string | null
): Promise<ApprovalResultData> {
  const approval = await tx.commercialApproval.findUnique({
    where: { id: approvalId },
    include: {
      estimateVersion: { select: { versionNumber: true } },
      sowVersion: { select: { versionNumber: true } },
    },
  });
  if (!approval || approval.revokedAt) {
    throw new Abort(fail("VALIDATION", "That approval is no longer active."));
  }

  if (kind === "UNDO" && !canUndoApproval(user, approval)) {
    // Distinguish "too late" from "not yours" for the right message.
    if (approval.recordedByUserId === user.id) {
      throw new Abort(fail("UNDO_WINDOW_EXPIRED", "The 10-second undo window has passed."));
    }
    throw new Abort(fail("FORBIDDEN", "Only the person who recorded the approval can undo it."));
  }

  // The SOW's approval depends on the estimate's: don't pull the estimate out from under it.
  if (
    approval.documentType === "ESTIMATE" &&
    (await findActiveApproval(tx, approval.projectId, "SOW"))
  ) {
    throw new Abort(fail("LOCKED", "The SOW approved from this estimate must be reverted first."));
  }

  // updateMany keyed on revokedAt IS NULL so two concurrent revokes can't both win.
  const { count } = await tx.commercialApproval.updateMany({
    where: { id: approvalId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedByUserId: user.id,
      revokeKind: kind,
      revokeReason: reason,
    },
  });
  if (count === 0) throw new Abort(fail("VALIDATION", "That approval is no longer active."));

  return {
    approvalId,
    projectId: approval.projectId,
    documentType: approval.documentType,
    versionNumber: (approval.estimateVersion ?? approval.sowVersion)?.versionNumber ?? 0,
  };
}

export async function undoApproval(
  db: PrismaClient,
  user: ApprovalActor | null,
  rawInput: unknown
): Promise<ActionResult<ApprovalResultData>> {
  const parsed = UndoApprovalSchema.safeParse(rawInput);
  if (!parsed.success)
    return fail("VALIDATION", "Choose an approval to undo.", fieldErrorsFrom(parsed.error));
  if (!user) return fail("FORBIDDEN", "You must be signed in.");
  return inTransaction(db, (tx) => revoke(tx, parsed.data.approvalId, user, "UNDO", null));
}

export async function revertApproval(
  db: PrismaClient,
  user: ApprovalActor | null,
  rawInput: unknown
): Promise<ActionResult<ApprovalResultData>> {
  const parsed = RevertApprovalSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(
      "VALIDATION",
      "Check the highlighted fields and try again.",
      fieldErrorsFrom(parsed.error)
    );
  }
  if (!user || !canRevertApproval(user)) {
    return fail("FORBIDDEN", "Only an admin can revert an approval.");
  }
  return inTransaction(db, (tx) =>
    revoke(tx, parsed.data.approvalId, user, "ADMIN_REVERT", parsed.data.reason)
  );
}

export type { ApprovalDb };
