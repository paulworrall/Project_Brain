import { prisma } from "@/lib/prisma";
import { getBriefCompleteness } from "@/lib/briefCompleteness";
import type { MissingBriefAttribute } from "@/app/(dashboard)/projects/[projectId]/actions";

export interface SowPreconditionFailure {
  message: string;
  /** Set when refused because required key attributes are still missing. */
  missingAttributes?: MissingBriefAttribute[];
}

export type SowPreconditions =
  | { ok: true; projectName: string; sowTemplateId: string | null; sowTemplateVersionId: string; templateText: string }
  | { ok: false; failure: SowPreconditionFailure };

/**
 * What must be true before a SOW review can start or a SOW can be composed:
 * the project exists, a SOW template version is selected, and every required
 * key detail is captured (the brief gate — enforced here, server-side; the
 * panel's alert is only the explanation). Shared by starting the review and
 * generating, so neither can be reached around the other.
 */
export async function checkSowPreconditions(projectId: string): Promise<SowPreconditions> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, sowTemplateId: true, sowTemplateVersionId: true },
  });
  if (!project) return { ok: false, failure: { message: "Project not found." } };
  if (!project.sowTemplateVersionId) {
    return { ok: false, failure: { message: "Select a SOW Template before generating." } };
  }

  const templateVersion = await prisma.sOWTemplateVersion.findUnique({
    where: { id: project.sowTemplateVersionId },
    select: { extractedText: true },
  });
  if (!templateVersion) {
    return { ok: false, failure: { message: "Selected SOW Template version no longer exists." } };
  }

  const completeness = await getBriefCompleteness(projectId);
  if (!completeness.canProceed) {
    return {
      ok: false,
      failure: {
        message: "We can't generate the SOW yet — add these key details first.",
        missingAttributes: completeness.requiredOutstanding.map((a) => ({
          id: a.id,
          label: a.label,
          question: a.question,
          status: a.status,
          missingSubFields: a.missingSubFields,
        })),
      },
    };
  }

  return {
    ok: true,
    projectName: project.name,
    sowTemplateId: project.sowTemplateId,
    sowTemplateVersionId: project.sowTemplateVersionId,
    templateText: templateVersion.extractedText,
  };
}
