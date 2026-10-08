import type { PrismaClient } from "@/generated/prisma/client";
import type { SowSectionKey } from "@/lib/sowReview";

/**
 * Seeds a project's PM-validated SOW items directly (the review overlay's
 * output), so tests of composition/versioning don't need to drive the UI.
 * Every item is an included AGENT item unless a spec says otherwise.
 */
export async function seedSowItems(
  prisma: PrismaClient,
  projectId: string,
  spec: Partial<Record<SowSectionKey, string[]>> = { DELIVERABLES: ["A relaunched app"] }
): Promise<void> {
  for (const [section, texts] of Object.entries(spec) as [SowSectionKey, string[]][]) {
    await prisma.sowSectionItem.createMany({
      data: texts.map((text, position) => ({
        projectId,
        section,
        text,
        agentOriginalText: text,
        source: "AGENT" as const,
        position,
      })),
    });
  }
}
