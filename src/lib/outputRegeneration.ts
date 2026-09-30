import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getProjectContext } from "@/lib/projectContext";
import { latestPositionDocumentContent } from "@/lib/positionDocument";
import { clarificationQuestionsFrom } from "@/lib/clarificationQuestions";
import { currentText, describeKnownKeyDetails } from "@/lib/keyDetailsContext";
import { CLIENT_CONTACT_FIELDS } from "@/lib/briefAttributes";
import { generateClarificationEmail } from "@/services/agents/intake-agent";
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
  type: "CLARIFICATION_EMAIL" | "POSITION_DOCUMENT",
  content: Prisma.InputJsonValue,
  builtFromVersion: number,
  userId: string | null,
  triggeredByUpdateVersion: number | null = null
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
        triggeredByUpdateVersion,
        createdById: userId,
      },
    });
    return { versionNumber, builtFromVersion };
  });
}

/**
 * A new draft of the client clarification email from the latest context:
 * it asks for the key details still missing, asks the client to confirm
 * what we took from their own brief and updates, and lists their
 * still-deciding items — the same structure as at intake. Only ever a
 * draft; nothing is sent. `triggeredByUpdateVersion` is set when it's
 * drafted automatically because that update was saved (userId is then null).
 * Throws IntakeAgentError if drafting fails.
 */
export async function redraftClarificationEmail(
  projectId: string,
  userId: string | null,
  triggeredByUpdateVersion: number | null = null
): Promise<RegeneratedVersion> {
  const [context, position] = await Promise.all([
    getProjectContext(projectId),
    latestPositionDocumentContent(projectId),
  ]);
  const email = await generateClarificationEmail(
    { whatWeKnow: position?.whatWeKnow ?? [], clientFlaggedOpenItems: position?.clientFlaggedOpenItems ?? [] },
    clarificationQuestionsFrom(context.keyDetails),
    context.pmPerspective,
    currentText(context.keyDetails, CLIENT_CONTACT_FIELDS.attributeId, CLIENT_CONTACT_FIELDS.name),
    context.text
  );
  return appendDocumentVersion(
    projectId,
    "CLARIFICATION_EMAIL",
    email,
    context.latestVersion,
    userId,
    triggeredByUpdateVersion
  );
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
