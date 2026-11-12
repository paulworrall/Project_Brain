import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { latestPositionDocumentContent } from "@/lib/positionDocument";
import { ScopeSummaryContentSchema, type ScopeSummaryContent } from "@/types/scope";

/**
 * FB-009: reading and writing the Scope summary (DocumentVersion rows of type
 * SCOPE_SUMMARY). Every query is scoped by projectId.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ScopeSummaryVersion {
  id: string;
  versionNumber: number;
  content: ScopeSummaryContent;
  createdAt: Date;
}

function toVersion(row: {
  id: string;
  versionNumber: number;
  content: unknown;
  createdAt: Date;
}): ScopeSummaryVersion | null {
  const parsed = ScopeSummaryContentSchema.safeParse(row.content);
  return parsed.success
    ? {
        id: row.id,
        versionNumber: row.versionNumber,
        content: parsed.data,
        createdAt: row.createdAt,
      }
    : null;
}

const VERSION_SELECT = { id: true, versionNumber: true, content: true, createdAt: true } as const;

/** The project's latest Scope summary version, or null if it has none. */
export async function latestScopeSummary(
  projectId: string,
  db: Db = prisma
): Promise<ScopeSummaryVersion | null> {
  const row = await db.documentVersion.findFirst({
    where: { document: { projectId, type: "SCOPE_SUMMARY" } },
    orderBy: { versionNumber: "desc" },
    select: VERSION_SELECT,
  });
  return row ? toVersion(row) : null;
}

/** One Scope summary version of this project (null if it isn't one). */
export async function scopeSummaryVersion(
  projectId: string,
  versionId: string,
  db: Db = prisma
): Promise<ScopeSummaryVersion | null> {
  const row = await db.documentVersion.findFirst({
    where: { id: versionId, document: { projectId, type: "SCOPE_SUMMARY" } },
    select: VERSION_SELECT,
  });
  return row ? toVersion(row) : null;
}

/** The version the PM confirmed (Project.confirmedScopeVersionId), or null. */
export async function confirmedScopeSummary(
  projectId: string,
  db: Db = prisma
): Promise<ScopeSummaryVersion | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { confirmedScopeVersionId: true },
  });
  return project?.confirmedScopeVersionId
    ? scopeSummaryVersion(projectId, project.confirmedScopeVersionId, db)
    : null;
}

/** Appends a Scope summary version (creating the document on first use). */
export async function appendScopeSummaryVersion(
  projectId: string,
  content: ScopeSummaryContent,
  {
    builtFromVersion = null,
    userId = null,
    triggeredByUpdateVersion = null,
  }: {
    builtFromVersion?: number | null;
    userId?: string | null;
    triggeredByUpdateVersion?: number | null;
  } = {},
  db: Db = prisma
): Promise<ScopeSummaryVersion> {
  const write = async (tx: Prisma.TransactionClient) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { currentStageNumber: true },
    });
    const document =
      (await tx.document.findUnique({
        where: { projectId_type: { projectId, type: "SCOPE_SUMMARY" } },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { versionNumber: true },
          },
        },
      })) ??
      (await tx.document.create({
        data: { projectId, type: "SCOPE_SUMMARY" },
        include: { versions: { select: { versionNumber: true } } },
      }));
    const row = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: (document.versions[0]?.versionNumber ?? 0) + 1,
        stageNumber: project.currentStageNumber,
        content,
        builtFromVersion,
        triggeredByUpdateVersion,
        createdById: userId,
      },
      select: VERSION_SELECT,
    });
    return { ...row, content };
  };
  return "$transaction" in db
    ? (db as PrismaClient).$transaction(write)
    : write(db as Prisma.TransactionClient);
}

/**
 * What the estimate brief and SOW generation read as their scope input: the
 * confirmed Scope summary version; else the latest Scope summary (scope not
 * confirmed yet); else, for a project created before FB-009 that has no Scope
 * summary, its Position Document.
 */
export async function scopeInputSection(projectId: string): Promise<string | null> {
  const confirmed = await confirmedScopeSummary(projectId);
  if (confirmed) {
    return `## Scope summary (confirmed, v${confirmed.versionNumber})\n${JSON.stringify(confirmed.content)}`;
  }
  const latest = await latestScopeSummary(projectId);
  if (latest) {
    return `## Scope summary (v${latest.versionNumber}, not yet confirmed)\n${JSON.stringify(latest.content)}`;
  }
  const position = await latestPositionDocumentContent(projectId);
  return position ? `## Position Document\n${JSON.stringify(position)}` : null;
}
