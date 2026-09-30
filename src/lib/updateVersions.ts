import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { UpdateSource } from "@/generated/prisma/enums";
import { updateLabel } from "@/lib/updateLabel";

/**
 * Project updates as versions of the brief: the original brief is v1
 * ("Initial brief"), each update the next version (v2, v3, …). Versions are
 * immutable once saved (enforced by a database trigger — see the
 * KnowledgeItem model); a correction is a new update.
 */
export const INITIAL_BRIEF_VERSION = 1;

type Db = PrismaClient | Prisma.TransactionClient;

export interface VersionEntry {
  /** "brief" for v1; otherwise the KnowledgeItem id. */
  id: string;
  /** Null only for an update saved before versioning that the backfill hasn't reached. */
  versionNumber: number | null;
  label: string;
  source: UpdateSource;
  createdAt: Date;
  /** v1: the brief's file name, if it was uploaded. */
  detail: string | null;
  summary: string | null;
  changeSummary: string | null;
  content: string;
}

/**
 * Numbers any updates that don't have a version yet, oldest first, after the
 * project's highest existing version (so the first update is v2). The
 * migration backfill runs this for every project; saving an update runs it
 * for its own project first, so nothing saved in between is ever skipped.
 * Idempotent. Returns how many updates it numbered.
 */
export async function assignMissingUpdateVersions(db: Db, projectId?: string): Promise<number> {
  const unnumbered = await db.knowledgeItem.findMany({
    where: { versionNumber: null, ...(projectId ? { projectId } : {}) },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    select: { id: true, projectId: true },
  });

  const nextByProject = new Map<string, number>();
  for (const item of unnumbered) {
    let next = nextByProject.get(item.projectId);
    if (next === undefined) {
      const { _max } = await db.knowledgeItem.aggregate({
        where: { projectId: item.projectId },
        _max: { versionNumber: true },
      });
      next = (_max.versionNumber ?? INITIAL_BRIEF_VERSION) + 1;
    }
    await db.knowledgeItem.update({ where: { id: item.id }, data: { versionNumber: next } });
    nextByProject.set(item.projectId, next + 1);
  }
  return unnumbered.length;
}

/** The version number the project's next update takes. */
export async function nextUpdateVersion(db: Db, projectId: string): Promise<number> {
  await assignMissingUpdateVersions(db, projectId);
  const { _max } = await db.knowledgeItem.aggregate({
    where: { projectId },
    _max: { versionNumber: true },
  });
  return (_max.versionNumber ?? INITIAL_BRIEF_VERSION) + 1;
}

/** Every version of the project's brief, oldest first: v1 the brief, then each update. */
export async function getVersionHistory(projectId: string): Promise<VersionEntry[]> {
  const [project, items] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { createdAt: true, briefFileName: true, briefRawText: true },
    }),
    prisma.knowledgeItem.findMany({
      where: { projectId },
      orderBy: [{ versionNumber: { sort: "asc", nulls: "last" } }, { uploadedAt: "asc" }],
    }),
  ]);

  return [
    {
      id: "brief",
      versionNumber: INITIAL_BRIEF_VERSION,
      label: "Initial brief",
      source: "CLIENT",
      createdAt: project.createdAt,
      detail: project.briefFileName,
      summary: null,
      changeSummary: null,
      content: project.briefRawText ?? "",
    },
    ...items.map(
      (item): VersionEntry => ({
        id: item.id,
        versionNumber: item.versionNumber,
        label: updateLabel(item),
        source: item.source,
        createdAt: item.uploadedAt,
        detail: null,
        summary: item.summary,
        changeSummary: item.changeSummary,
        content: item.content,
      })
    ),
  ];
}

export function sourceLabel(source: UpdateSource): string {
  return source === "INTERNAL_TEAM" ? "Internal team" : "Client";
}

/**
 * Everything known before a given version — the brief and every earlier
 * update, in order, each with its version and source — for the "what
 * changed" summary.
 */
export async function formatVersionsBefore(projectId: string, versionNumber: number): Promise<string> {
  const earlier = (await getVersionHistory(projectId)).filter(
    (v) => v.versionNumber !== null && v.versionNumber < versionNumber
  );
  return earlier
    .map((v) => `## v${v.versionNumber} — ${v.label} (${sourceLabel(v.source)})\n${v.content || "(empty)"}`)
    .join("\n\n");
}
