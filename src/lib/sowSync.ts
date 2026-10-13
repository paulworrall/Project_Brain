import { prisma } from "@/lib/prisma";
import {
  evaluateSowSync,
  sowVersionSourceLabel,
  type EstimateVersionRef,
  type ProjectSowSync,
} from "@/lib/sowSyncView";

export type { ProjectSowSync, SowSyncStatus } from "@/lib/sowSyncView";

/**
 * The estimate half of the SOW change status: whether a project's SOW still
 * matches the estimate it's pinned to. Not read by any surface directly —
 * getSowChangeStatus (src/lib/sowChangeStatus.ts) builds on it, so there's one
 * answer everywhere. Staleness is derived here, at read time,
 * by comparing the SOW version's pinned estimate version id with that
 * estimate's latest version id; nothing is stored.
 *
 * "Current" = the latest version of the estimate the SOW is pinned to. A new
 * version of a different estimate on the project doesn't affect it. Every
 * query is scoped by projectId.
 */
export async function getSowSyncStatus(projectId: string): Promise<ProjectSowSync> {
  const sowVersions = await prisma.sOWVersion.findMany({
    where: { sow: { projectId } },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      sourceEstimateTotal: true,
      sourceEstimateCurrency: true,
      sourceEstimateCapabilities: true,
      sourceEstimateVersion: {
        select: {
          id: true,
          versionNumber: true,
          estimate: { select: { id: true, label: true, projectId: true } },
        },
      },
    },
  });
  if (sowVersions.length === 0) {
    return { sow: null, versions: [], needsAttention: false };
  }

  // The latest version of every estimate a SOW version is pinned to.
  const estimateIds = [
    ...new Set(
      sowVersions.flatMap((v) =>
        v.sourceEstimateVersion?.estimate.projectId === projectId ? [v.sourceEstimateVersion.estimate.id] : []
      )
    ),
  ];
  const latestVersions = await prisma.estimateVersion.findMany({
    where: { estimateId: { in: estimateIds }, estimate: { projectId } },
    orderBy: { versionNumber: "desc" },
    distinct: ["estimateId"],
    select: {
      id: true,
      versionNumber: true,
      totalValue: true,
      currency: true,
      capabilitiesIncluded: true,
      createdAt: true,
      estimate: { select: { id: true, label: true } },
    },
  });
  const currentByEstimate = new Map<string, EstimateVersionRef>(
    latestVersions.map((v) => [
      v.estimate.id,
      {
        estimateVersionId: v.id,
        estimateId: v.estimate.id,
        estimateLabel: v.estimate.label,
        versionNumber: v.versionNumber,
        total: Number(v.totalValue),
        currency: v.currency,
        capabilities: v.capabilitiesIncluded,
        savedAt: v.createdAt,
      },
    ])
  );

  const statuses = sowVersions.map((v) => {
    const pinned = v.sourceEstimateVersion;
    const source: EstimateVersionRef | null =
      pinned && pinned.estimate.projectId === projectId && v.sourceEstimateTotal !== null && v.sourceEstimateCurrency
        ? {
            estimateVersionId: pinned.id,
            estimateId: pinned.estimate.id,
            estimateLabel: pinned.estimate.label,
            versionNumber: pinned.versionNumber,
            // The snapshot taken when the SOW was generated.
            total: Number(v.sourceEstimateTotal),
            currency: v.sourceEstimateCurrency,
            capabilities: v.sourceEstimateCapabilities,
          }
        : null;
    return evaluateSowSync({
      sowVersionId: v.id,
      sowVersionNumber: v.versionNumber,
      source,
      current: source ? (currentByEstimate.get(source.estimateId) ?? null) : null,
    });
  });

  const latest = statuses[0];
  return {
    sow: latest,
    versions: statuses.map((s) => ({
      sowVersionId: s.sowVersionId,
      sowVersionNumber: s.sowVersionNumber,
      label: sowVersionSourceLabel(s),
      status: s.status,
      sourceVersionNumber: s.source?.versionNumber ?? null,
    })),
    needsAttention: latest.status !== "in_sync",
  };
}
