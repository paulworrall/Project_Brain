import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ScopeSummaryContentSchema, changedScopeSections } from "@/types/scope";
import { evaluateEstimateScopeSync, type EstimateScopeSync } from "@/lib/estimateScopeSyncView";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ProjectEstimateScopeSync {
  /** One entry per estimate track that has a saved version. */
  estimates: EstimateScopeSync[];
  /** Any estimate is stale against the confirmed scope (drives "Needs review"). */
  needsReview: boolean;
}

/**
 * FB-009 B: the single source of truth for whether each estimate still
 * reflects the confirmed Scope summary — every surface (the estimate card
 * notice, the stepper's "Needs review", the Next step banner, the pipeline)
 * reads this. Compares each estimate's latest version's sourceScopeVersionId
 * with Project.confirmedScopeVersionId. Every query is scoped by projectId.
 */
export async function getEstimateScopeSyncStatus(
  projectId: string,
  db: Db = prisma
): Promise<ProjectEstimateScopeSync> {
  const [project, estimates] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        confirmedScopeVersion: {
          select: { id: true, versionNumber: true, createdAt: true, content: true },
        },
      },
    }),
    db.estimate.findMany({
      where: { projectId },
      select: {
        id: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            sourceScopeVersion: {
              select: { id: true, versionNumber: true, createdAt: true, content: true },
            },
            approvals: { where: { revokedAt: null }, select: { id: true } },
          },
        },
      },
    }),
  ]);
  const confirmed = project?.confirmedScopeVersion ?? null;
  const confirmedContent = ScopeSummaryContentSchema.safeParse(confirmed?.content);

  const results = estimates
    .filter((e) => e.versions[0])
    .map((estimate) => {
      const latest = estimate.versions[0];
      const source = latest.sourceScopeVersion;
      const sourceContent = ScopeSummaryContentSchema.safeParse(source?.content);
      return evaluateEstimateScopeSync({
        estimateId: estimate.id,
        source,
        confirmed,
        changedSections:
          sourceContent.success && confirmedContent.success
            ? changedScopeSections(sourceContent.data, confirmedContent.data)
            : [],
        approved: latest.approvals.length > 0,
      });
    });
  return { estimates: results, needsReview: results.some((r) => r.status === "stale") };
}
