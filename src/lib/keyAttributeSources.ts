import { prisma } from "@/lib/prisma";
import { saveKeyAttributeSuggestions } from "@/lib/briefAttributeSuggestions";
import {
  KeyAttributeExtractionError,
  extractKeyAttributes,
  type KeyAttributeExtraction,
} from "@/services/agents/key-attribute-extraction";

/**
 * Records the outcome of the latest key-attribute extraction on the project:
 * a failure message and time (so the PM can see key details couldn't be
 * read, instead of them silently staying empty), cleared on success.
 */
export async function recordKeyAttributeExtractionOutcome(
  projectId: string,
  errorMessage: string | null
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: errorMessage
      ? { keyAttributeExtractionFailedAt: new Date(), keyAttributeExtractionError: errorMessage }
      : { keyAttributeExtractionFailedAt: null, keyAttributeExtractionError: null },
  });
}

/**
 * Extracts key attributes from one piece of text, recording the outcome on
 * the project. Never throws for an extraction failure — returns null — so it
 * can't block the upload or intake that called it.
 */
export async function extractKeyAttributesRecordingOutcome(
  projectId: string,
  text: string,
  sourceKind: "brief" | "update"
): Promise<KeyAttributeExtraction | null> {
  try {
    const extraction = await extractKeyAttributes(text, sourceKind);
    await recordKeyAttributeExtractionOutcome(projectId, null);
    return extraction;
  } catch (error) {
    if (!(error instanceof KeyAttributeExtractionError)) {
      throw error;
    }
    console.error("Key attribute extraction failed:", error.cause ?? error);
    await recordKeyAttributeExtractionOutcome(projectId, error.message);
    return null;
  }
}

/**
 * Re-reads the stored brief and every Additional Input (oldest first) and
 * saves what they state as key-attribute SUGGESTIONS — never confirmed.
 * Used by "Suggest from brief & inputs" and the one-off backfill. Returns
 * how many suggestions were saved, or an error message if extraction failed
 * (also recorded on the project).
 */
export async function suggestKeyAttributesFromProjectSources(
  projectId: string
): Promise<{ saved: number; error: string | null }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      briefRawText: true,
      knowledgeItems: { orderBy: { uploadedAt: "asc" }, select: { id: true, content: true } },
    },
  });

  const sources = [
    ...(project.briefRawText
      ? [
          {
            text: project.briefRawText,
            kind: "brief" as const,
            source: "BRIEF" as const,
            knowledgeItemId: null,
          },
        ]
      : []),
    ...project.knowledgeItems.map((item) => ({
      text: item.content,
      kind: "update" as const,
      source: "UPDATE" as const,
      knowledgeItemId: item.id,
    })),
  ];
  if (sources.length === 0) {
    return { saved: 0, error: "There's no brief or input on this project to read yet." };
  }

  let extractions: KeyAttributeExtraction[];
  try {
    extractions = await Promise.all(sources.map((s) => extractKeyAttributes(s.text, s.kind)));
  } catch (error) {
    if (!(error instanceof KeyAttributeExtractionError)) {
      throw error;
    }
    console.error("Key attribute extraction failed:", error.cause ?? error);
    await recordKeyAttributeExtractionOutcome(projectId, error.message);
    return { saved: 0, error: error.message };
  }

  await recordKeyAttributeExtractionOutcome(projectId, null);
  const saved = await saveKeyAttributeSuggestions(
    projectId,
    sources.map((s, index) => ({
      extraction: extractions[index],
      source: s.source,
      knowledgeItemId: s.knowledgeItemId,
    }))
  );
  return { saved, error: null };
}
