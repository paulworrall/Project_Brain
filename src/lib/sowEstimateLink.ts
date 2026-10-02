import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Why the backfill left a legacy SOW version unlinked rather than guess. */
export type UnlinkedReason =
  /** The SOW was generated with no estimate figures at all. */
  | "no-estimate-figures"
  /** No estimate version existed before the SOW was generated. */
  | "no-prior-estimate-version"
  /** More than one estimate had a version before the SOW — can't tell which it used. */
  | "multiple-estimates"
  /** The only candidate's total/currency don't match the figures frozen in the SOW. */
  | "figures-mismatch";

export interface SowEstimateBackfillReport {
  linked: { sowVersionId: string; estimateVersionId: string }[];
  unlinked: { sowVersionId: string; reason: UnlinkedReason }[];
  /** SOW versions that already had a link — never touched. */
  alreadyLinked: number;
}

interface FrozenCommercials {
  totalValue: number;
  currency: string;
}

function frozenCommercials(content: unknown): FrozenCommercials | null {
  const commercials = (content as { coverDetails?: { commercials?: unknown } } | null)?.coverDetails
    ?.commercials as Partial<FrozenCommercials> | null | undefined;
  return commercials && typeof commercials.totalValue === "number" && typeof commercials.currency === "string"
    ? { totalValue: commercials.totalValue, currency: commercials.currency }
    : null;
}

/**
 * Links SOW versions made before the SOW ↔ estimate link existed to the
 * estimate version they were built from: the latest estimate version saved
 * before the SOW version, for the one estimate the project had then. That's
 * exactly what generation used (the most recently saved version), and it's
 * only accepted when its total and currency match the commercials frozen in
 * the SOW. Anything ambiguous — several estimates, no earlier version, no
 * figures, figures that don't match — is left unlinked, with the reason.
 * Idempotent: already-linked versions are never touched, and re-running
 * gives the same result. Scope to one project with `projectId`.
 */
export async function backfillSowEstimateLinks(
  db: Db,
  { projectId }: { projectId?: string } = {}
): Promise<SowEstimateBackfillReport> {
  const scope = projectId ? { sow: { projectId } } : {};
  const [candidates, alreadyLinked] = await Promise.all([
    db.sOWVersion.findMany({
      where: { ...scope, sourceEstimateVersionId: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, createdAt: true, content: true, sow: { select: { projectId: true } } },
    }),
    db.sOWVersion.count({ where: { ...scope, sourceEstimateVersionId: { not: null } } }),
  ]);

  const report: SowEstimateBackfillReport = { linked: [], unlinked: [], alreadyLinked };

  for (const sowVersion of candidates) {
    const figures = frozenCommercials(sowVersion.content);
    if (!figures) {
      report.unlinked.push({ sowVersionId: sowVersion.id, reason: "no-estimate-figures" });
      continue;
    }

    const priorVersions = await db.estimateVersion.findMany({
      where: { estimate: { projectId: sowVersion.sow.projectId }, createdAt: { lte: sowVersion.createdAt } },
      orderBy: [{ createdAt: "desc" }, { versionNumber: "desc" }],
      select: { id: true, estimateId: true, totalValue: true, currency: true, capabilitiesIncluded: true },
    });
    if (priorVersions.length === 0) {
      report.unlinked.push({ sowVersionId: sowVersion.id, reason: "no-prior-estimate-version" });
      continue;
    }
    if (new Set(priorVersions.map((v) => v.estimateId)).size > 1) {
      report.unlinked.push({ sowVersionId: sowVersion.id, reason: "multiple-estimates" });
      continue;
    }

    const latest = priorVersions[0];
    if (Number(latest.totalValue) !== figures.totalValue || latest.currency !== figures.currency) {
      report.unlinked.push({ sowVersionId: sowVersion.id, reason: "figures-mismatch" });
      continue;
    }

    await db.sOWVersion.update({
      where: { id: sowVersion.id },
      data: {
        sourceEstimateVersionId: latest.id,
        sourceEstimateTotal: latest.totalValue,
        sourceEstimateCurrency: latest.currency,
        sourceEstimateCapabilities: latest.capabilitiesIncluded,
      },
    });
    report.linked.push({ sowVersionId: sowVersion.id, estimateVersionId: latest.id });
  }

  return report;
}
