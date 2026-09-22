import { prisma } from "@/lib/prisma";
import { PositionDocumentFieldsSchema } from "@/types/intake";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { SowCoverDetails } from "@/types/sow";

export interface SowContext {
  narrativeContext: string;
  coverDetails: SowCoverDetails;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Everything captured about a project that a SOW draft needs — narrative
 * content for the agent (following assembleCapabilityBriefContext's
 * flattened "## Heading\n..." string style, extended to also cover the
 * Deliverables & Services Document, confirmed capabilities, and the
 * project's latest saved pricing, none of which that narrower assembler
 * includes), plus deterministic cover-details fields the agent never
 * touches (see src/types/sow.ts). Every query here is relation-scoped to
 * projectId directly, so there's no bare unscoped findMany to additionally
 * guard the way assembleProjectContext's redundant re-filter protects
 * against elsewhere — the isolation guarantee holds by construction.
 */
export async function assembleSowContext(projectId: string): Promise<SowContext> {
  const [project, positionDocument, draftScopeDocument, deliverablesServicesDocument, confirmedCapabilities, latestEstimateVersion] =
    await Promise.all([
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          name: true,
          briefRawText: true,
          jobCode: true,
          kickOffDate: true,
          targetCompletionDate: true,
          workstream: { select: { client: { select: { name: true } } } },
        },
      }),
      prisma.document.findUnique({
        where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.document.findUnique({
        where: { projectId_type: { projectId, type: "DRAFT_SCOPE_DOCUMENT" } },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.document.findUnique({
        where: { projectId_type: { projectId, type: "DELIVERABLES_SERVICES_DOCUMENT" } },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.projectCapability.findMany({ where: { projectId } }),
      // A Project can have several Estimate tracks, each independently
      // versioned (versionNumber is unique only within one Estimate, not
      // project-wide) — this relation filter finds the single most
      // recently saved version across all of them.
      prisma.estimateVersion.findFirst({
        where: { estimate: { projectId } },
        orderBy: { createdAt: "desc" },
        select: { totalValue: true, currency: true, description: true },
      }),
    ]);

  const sections: string[] = [];
  if (project.briefRawText) {
    sections.push(`## Original brief\n${project.briefRawText}`);
  }

  const positionContent = positionDocument?.versions[0]?.content;
  const parsedPosition = positionContent ? PositionDocumentFieldsSchema.safeParse(positionContent) : null;
  if (positionContent) {
    sections.push(`## Position Document\n${JSON.stringify(positionContent)}`);
  }

  const draftScopeContent = draftScopeDocument?.versions[0]?.content;
  if (draftScopeContent) {
    sections.push(`## Draft Scope Document\n${JSON.stringify(draftScopeContent)}`);
  }

  const deliverablesServicesContent = deliverablesServicesDocument?.versions[0]?.content;
  if (deliverablesServicesContent) {
    sections.push(`## Deliverables & Services Document\n${JSON.stringify(deliverablesServicesContent)}`);
  }

  if (confirmedCapabilities.length > 0) {
    sections.push(
      `## Confirmed specialist capabilities\n${confirmedCapabilities.map((c) => capabilityLabel(c.capability)).join(", ")}`
    );
  }

  sections.push(
    latestEstimateVersion
      ? `## Latest saved estimate\n${latestEstimateVersion.totalValue} ${latestEstimateVersion.currency} — ${latestEstimateVersion.description}`
      : "## Latest saved estimate\nNo estimate has been saved for this project yet."
  );

  const narrativeContext =
    sections.length > 0 ? sections.join("\n\n") : "No brief content has been captured for this project yet.";

  const coverDetails: SowCoverDetails = {
    projectName: project.name,
    clientName: project.workstream.client.name,
    jobCode: project.jobCode,
    preparedDate: formatDate(new Date()),
    kickOffDate: project.kickOffDate ? formatDate(project.kickOffDate) : null,
    targetCompletionDate: project.targetCompletionDate ? formatDate(project.targetCompletionDate) : null,
    primaryClientContactName: parsedPosition?.success ? parsedPosition.data.primaryContactName : null,
    primaryClientContactEmail: parsedPosition?.success ? parsedPosition.data.primaryContactEmail : null,
    commercials: latestEstimateVersion
      ? {
          totalValue: Number(latestEstimateVersion.totalValue),
          currency: latestEstimateVersion.currency,
          description: latestEstimateVersion.description,
        }
      : null,
  };

  return { narrativeContext, coverDetails };
}
