import { prisma } from "@/lib/prisma";
import { PositionDocumentFieldsSchema, type PositionDocumentFields } from "@/types/intake";

/** The project's latest Position Document content, or null if there's none (or it can't be read). */
export async function latestPositionDocumentContent(
  projectId: string
): Promise<PositionDocumentFields | null> {
  const version = await prisma.documentVersion.findFirst({
    where: { document: { projectId, type: "POSITION_DOCUMENT" } },
    orderBy: { versionNumber: "desc" },
    select: { content: true },
  });
  const parsed = PositionDocumentFieldsSchema.safeParse(version?.content);
  return parsed.success ? parsed.data : null;
}
