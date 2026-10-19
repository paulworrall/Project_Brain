import type { PrismaClient } from "@/generated/prisma/client";
import type { ApprovalDb } from "@/lib/commercial/approvalGuards";
import { deriveApprovalState } from "@/lib/commercial/approvalState";
import type {
  ApprovalInfo,
  ApprovalState,
  ApprovedDocSummary,
  ApprovedDocumentsSummary,
} from "@/types/approvals";

/** Everything the project page needs to know about the project's active approvals. */
export interface ProjectApprovals {
  summary: ApprovedDocumentsSummary;
  /** The approved estimate version (and its parent estimate), if any. */
  approvedEstimateVersionId: string | null;
  approvedEstimateId: string | null;
  approvedEstimateVersionNumber: number | null;
  approvedSowVersionId: string | null;
}

export async function getProjectApprovals(
  db: ApprovalDb,
  projectId: string
): Promise<ProjectApprovals> {
  const rows = await db.commercialApproval.findMany({
    where: { projectId, revokedAt: null },
    include: {
      recordedBy: { select: { id: true, name: true } },
      estimateVersion: {
        select: {
          id: true,
          versionNumber: true,
          totalValue: true,
          currency: true,
          estimate: { select: { id: true, label: true } },
        },
      },
      sowVersion: {
        select: {
          id: true,
          versionNumber: true,
          sourceEstimateTotal: true,
          sourceEstimateCurrency: true,
        },
      },
    },
  });

  const infoOf = (row: (typeof rows)[number]): ApprovalInfo => ({
    id: row.id,
    clientApprovedOn: row.clientApprovedOn.toISOString().slice(0, 10),
    clientApproverName: row.clientApproverName,
    reference: row.reference,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  });

  let estimate: ApprovedDocSummary | null = null;
  let sow: ApprovedDocSummary | null = null;
  let approvedEstimateId: string | null = null;

  for (const row of rows) {
    if (row.documentType === "ESTIMATE" && row.estimateVersion) {
      const v = row.estimateVersion;
      approvedEstimateId = v.estimate.id;
      estimate = {
        documentType: "ESTIMATE",
        name: v.estimate.label,
        versionId: v.id,
        versionNumber: v.versionNumber,
        total: Number(v.totalValue),
        currency: v.currency,
        approval: infoOf(row),
        downloadHref: `/api/projects/${projectId}/estimates/${v.estimate.id}/versions/${v.id}`,
        sectionId: "estimates",
      };
    } else if (row.documentType === "SOW" && row.sowVersion) {
      const v = row.sowVersion;
      sow = {
        documentType: "SOW",
        name: "Statement of Work",
        versionId: v.id,
        versionNumber: v.versionNumber,
        total: v.sourceEstimateTotal === null ? null : Number(v.sourceEstimateTotal),
        currency: v.sourceEstimateCurrency,
        approval: infoOf(row),
        downloadHref: `/api/projects/${projectId}/sow/${v.id}`,
        sectionId: "sow",
      };
    }
  }

  return {
    summary: { estimate, sow },
    approvedEstimateVersionId: estimate?.versionId ?? null,
    approvedEstimateId,
    approvedEstimateVersionNumber: estimate?.versionNumber ?? null,
    approvedSowVersionId: sow?.versionId ?? null,
  };
}

/** State + approval for one version, via the same pure function the server rules use. */
export function approvalViewFor(
  approvals: ProjectApprovals,
  documentType: "ESTIMATE" | "SOW",
  versionId: string,
  isLatestVersion: boolean
): { approvalState: ApprovalState; approval: ApprovalInfo | null } {
  const approvedVersionId =
    documentType === "ESTIMATE"
      ? approvals.approvedEstimateVersionId
      : approvals.approvedSowVersionId;
  const doc = documentType === "ESTIMATE" ? approvals.summary.estimate : approvals.summary.sow;
  const hasActiveApproval = approvedVersionId === versionId;
  return {
    approvalState: deriveApprovalState({
      hasActiveApproval,
      isLatestVersion,
      // "Not approved" is an estimate-only status: SOW versions are one document, so older ones read Superseded.
      projectHasOtherApproval:
        documentType === "ESTIMATE" && approvedVersionId !== null && !hasActiveApproval,
    }),
    approval: hasActiveApproval ? (doc?.approval ?? null) : null,
  };
}

/**
 * Stage 6 (Build the estimate) and 8 (Commercials & SOW) show Complete while
 * their document is approved. Computed on read, never stored: reverting an
 * approval just drops the override, so the stage returns to whatever it was.
 */
export function stageStatusWithApprovals<S extends string>(
  stageNumber: number,
  stored: S,
  summary: ApprovedDocumentsSummary
): S | "COMPLETE" {
  if (stageNumber === 6 && summary.estimate) return "COMPLETE";
  if (stageNumber === 8 && summary.sow) return "COMPLETE";
  return stored;
}

export type { PrismaClient };
