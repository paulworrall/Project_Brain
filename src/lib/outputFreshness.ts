import { prisma } from "@/lib/prisma";
import { getVersionHistory, INITIAL_BRIEF_VERSION } from "@/lib/updateVersions";
import { evaluateFreshness, type FreshnessChanges, type OutputFreshness } from "@/lib/freshness";

export { evaluateFreshness, staleHeadline } from "@/lib/freshness";
export type { Freshness, FreshnessChanges, OutputFreshness } from "@/lib/freshness";

export interface ProjectOutputFreshness {
  positionDocument?: OutputFreshness;
  clarificationEmail?: OutputFreshness;
  estimateBrief?: OutputFreshness;
  sow?: OutputFreshness;
  deliverablesServices?: OutputFreshness;
  /** Per estimate id, for its latest saved version. */
  estimates: Record<string, OutputFreshness>;
}

/** Freshness of every generated output on a project. Every query is scoped by projectId. */
export async function getOutputFreshness(projectId: string): Promise<ProjectOutputFreshness> {
  const [versions, pmEntries, keyDetailRows, documents, estimateBrief, sow, estimates] = await Promise.all([
    getVersionHistory(projectId),
    prisma.pmPerspectiveEntry.findMany({ where: { projectId }, select: { updatedAt: true } }),
    prisma.briefAttributeValue.findMany({
      where: { projectId },
      select: { createdAt: true, source: true, knowledgeItem: { select: { versionNumber: true } } },
    }),
    prisma.document.findMany({
      where: {
        projectId,
        type: { in: ["POSITION_DOCUMENT", "CLARIFICATION_EMAIL", "DELIVERABLES_SERVICES_DOCUMENT"] },
      },
      select: {
        type: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { createdAt: true, builtFromVersion: true },
        },
      },
    }),
    prisma.estimateBriefVersion.findFirst({
      where: { estimateBrief: { projectId } },
      orderBy: { versionNumber: "desc" },
      select: { createdAt: true, builtFromVersion: true },
    }),
    prisma.sOWVersion.findFirst({
      where: { sow: { projectId } },
      orderBy: { versionNumber: "desc" },
      select: { createdAt: true, builtFromVersion: true },
    }),
    prisma.estimate.findMany({
      where: { projectId },
      select: {
        id: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  const changes: FreshnessChanges = {
    updates: versions.flatMap((v) =>
      v.id !== "brief" && v.versionNumber !== null
        ? [{ versionNumber: v.versionNumber, uploadedAt: v.createdAt }]
        : []
    ),
    pmEdits: pmEntries.map((e) => e.updatedAt),
    keyDetailChanges: keyDetailRows.map((row) => ({
      createdAt: row.createdAt,
      fromVersion:
        row.source === "BRIEF"
          ? INITIAL_BRIEF_VERSION
          : row.source === "PM_ENTRY"
            ? null
            : (row.knowledgeItem?.versionNumber ?? null),
    })),
  };

  const assess = (
    built: { createdAt: Date; builtFromVersion?: number | null } | undefined | null,
    canRegenerate: boolean
  ): OutputFreshness | undefined =>
    built
      ? {
          ...evaluateFreshness(
            { builtFromVersion: built.builtFromVersion ?? null, builtAt: built.createdAt },
            changes
          ),
          canRegenerate,
        }
      : undefined;
  const latestOf = (type: string) => documents.find((d) => d.type === type)?.versions[0];

  return {
    positionDocument: assess(latestOf("POSITION_DOCUMENT"), true),
    clarificationEmail: assess(latestOf("CLARIFICATION_EMAIL"), true),
    estimateBrief: assess(estimateBrief, true),
    sow: assess(sow, true),
    // Built from specialist feedback — a person's input — so flag only.
    deliverablesServices: assess(latestOf("DELIVERABLES_SERVICES_DOCUMENT"), false),
    // Estimates come from the team's own input: flag only, never regenerated.
    estimates: Object.fromEntries(
      estimates.flatMap((e) => {
        const freshness = assess(e.versions[0], false);
        return freshness ? [[e.id, freshness]] : [];
      })
    ),
  };
}
