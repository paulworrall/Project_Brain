import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getProjectContext } from "@/lib/projectContext";
import { describeKnownKeyDetails } from "@/lib/keyDetailsContext";
import { rebuildPositionDocument } from "@/services/agents/clarification-extraction";
import { removeItemsCoveredByKeyDetails } from "@/services/agents/position-key-detail-filter";

/**
 * Regenerating an output always appends a new version, built from the latest
 * project context and recording which brief version that was. Earlier
 * versions are never changed.
 */
export interface RegeneratedVersion {
  versionNumber: number;
  builtFromVersion: number;
}

async function appendDocumentVersion(
  projectId: string,
  type: "POSITION_DOCUMENT",
  content: Prisma.InputJsonValue,
  builtFromVersion: number,
  userId: string | null
): Promise<RegeneratedVersion> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { currentStageNumber: true },
    });
    const document =
      (await tx.document.findUnique({
        where: { projectId_type: { projectId, type } },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      })) ?? (await tx.document.create({ data: { projectId, type }, include: { versions: true } }));
    const versionNumber = (document.versions[0]?.versionNumber ?? 0) + 1;
    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber,
        stageNumber: project.currentStageNumber,
        content,
        builtFromVersion,
        createdById: userId,
      },
    });
    return { versionNumber, builtFromVersion };
  });
}

/**
 * A new Position Document version rebuilt from the whole context (brief and
 * every update), with anything the key details already cover removed.
 * Throws ClarificationExtractionError if the rebuild fails.
 */
export async function rebuildPositionDocumentVersion(
  projectId: string,
  userId: string | null
): Promise<RegeneratedVersion> {
  const context = await getProjectContext(projectId);
  const rebuilt = await rebuildPositionDocument(context.text, context.pmPerspective);
  const content = {
    ...rebuilt,
    whatWeKnow: await removeItemsCoveredByKeyDetails(
      rebuilt.whatWeKnow,
      describeKnownKeyDetails(context.keyDetails, null)
    ),
  };
  return appendDocumentVersion(projectId, "POSITION_DOCUMENT", content, context.latestVersion, userId);
}
