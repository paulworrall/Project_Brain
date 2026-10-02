import { prisma } from "@/lib/prisma";
import { CLIENT_CONTACT_FIELDS } from "@/lib/briefAttributes";
import { currentText } from "@/lib/keyDetailsContext";
import { getProjectContext } from "@/lib/projectContext";
import { latestPositionDocumentContent } from "@/lib/positionDocument";
import { capabilityLabel } from "@/lib/mapCapabilities";
import type { SowCoverDetails } from "@/types/sow";
import type { Capability } from "@/generated/prisma/enums";

export interface SowContext {
  narrativeContext: string;
  coverDetails: SowCoverDetails;
  /** The brief version the context reflects, for the SOW version to record. */
  builtFromVersion: number;
  /** The estimate version the commercials come from (null if none is saved yet), for the SOW to pin. */
  sourceEstimate: SourceEstimateSnapshot | null;
}

/** What a SOW version records about the estimate version it was built from. */
export interface SourceEstimateSnapshot {
  estimateVersionId: string;
  total: number;
  currency: string;
  capabilities: Capability[];
}

export function formatSowDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Everything captured about a project that a SOW draft needs — the shared
 * project context (brief, every update, key details, the PM's view; see
 * getProjectContext) plus the Position Document, the Deliverables &
 * Services Document, confirmed capabilities and the latest saved pricing —
 * and deterministic cover-details fields the agent never touches (see
 * src/types/sow.ts). Every query here is scoped to projectId at the query
 * layer.
 */
export async function assembleSowContext(projectId: string): Promise<SowContext> {
  const [project, context, positionContent, deliverablesServicesDocument, confirmedCapabilities, latestEstimateVersion] =
    await Promise.all([
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          name: true,
          jobCode: true,
          kickOffDate: true,
          targetCompletionDate: true,
          workstream: { select: { client: { select: { name: true } } } },
        },
      }),
      // The brief, every update, key details and the PM's view — the same
      // context every agent works from.
      getProjectContext(projectId),
      latestPositionDocumentContent(projectId),
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
        select: {
          id: true,
          totalValue: true,
          currency: true,
          description: true,
          needsRecalculation: true,
          capabilitiesIncluded: true,
        },
      }),
    ]);
  const briefCompleteness = context.keyDetails;

  // Key details come with the context: current values, trusted by default.
  // (SOW-specific rules for which values may appear are to be decided later.)
  const sections: string[] = [context.text];

  if (positionContent) {
    sections.push(`## Position Document\n${JSON.stringify(positionContent)}`);
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
      ? `## Latest saved estimate\n${latestEstimateVersion.totalValue} ${latestEstimateVersion.currency} — ${latestEstimateVersion.description}${
          latestEstimateVersion.needsRecalculation
            ? "\nWARNING: this estimate was calculated before hours/days/weeks were converted to hours and is flagged for recalculation — do not treat its total as final; say the commercials are pending a recalculated estimate."
            : ""
        }`
      :"## Latest saved estimate\nNo estimate has been saved for this project yet."
  );

  const narrativeContext = sections.join("\n\n");

  const coverDetails: SowCoverDetails = {
    projectName: project.name,
    clientName: project.workstream.client.name,
    jobCode: project.jobCode,
    preparedDate: formatSowDate(new Date()),
    kickOffDate: project.kickOffDate ? formatSowDate(project.kickOffDate) : null,
    targetCompletionDate: project.targetCompletionDate ? formatSowDate(project.targetCompletionDate) : null,
    // Only ever the Client Contact key detail — never inferred from elsewhere.
    primaryClientContactName: currentText(briefCompleteness, CLIENT_CONTACT_FIELDS.attributeId, CLIENT_CONTACT_FIELDS.name),
    primaryClientContactEmail: currentText(briefCompleteness, CLIENT_CONTACT_FIELDS.attributeId, CLIENT_CONTACT_FIELDS.email),
    commercials: latestEstimateVersion
      ? {
          totalValue: Number(latestEstimateVersion.totalValue),
          currency: latestEstimateVersion.currency,
          description: latestEstimateVersion.description,
          needsRecalculation: latestEstimateVersion.needsRecalculation,
        }
      : null,
  };

  return {
    narrativeContext,
    coverDetails,
    builtFromVersion: context.latestVersion,
    sourceEstimate: latestEstimateVersion
      ? {
          estimateVersionId: latestEstimateVersion.id,
          total: Number(latestEstimateVersion.totalValue),
          currency: latestEstimateVersion.currency,
          capabilities: latestEstimateVersion.capabilitiesIncluded,
        }
      : null,
  };
}
