import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { evaluateBriefCompleteness } from "@/lib/briefCompleteness";
import { getBriefAttribute } from "@/lib/briefAttributes";
import {
  deriveStepStatuses,
  getCurrentStepId,
  isProjectComplete,
  type StepId,
} from "@/lib/projectSteps";
import { deriveNextAction } from "@/lib/nextAction";
import { ScopeSummaryContentSchema } from "@/types/scope";
import { normaliseBriefAssessment } from "@/types/intake";

/**
 * FB-009 F: the pipeline home page's data — every project grouped by its
 * current step (Brief · Estimate · SOW · Complete), each with its next action.
 *
 * One findMany with nested relations: Prisma runs a fixed number of queries
 * per relation, however many projects there are — no per-project lookups
 * (no N+1). Step status and the next action come from the same pure
 * functions the project page uses (deriveStepStatuses, deriveNextAction).
 * Staleness here is the version-link part only: an estimate built against an
 * older confirmed scope, and a SOW built from an older estimate version. (The
 * SOW's key-detail snapshot check needs per-project work, so it is left to
 * the project page.)
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type PipelineColumn = StepId | "complete";

/** The pipeline's columns, in order. */
export const PIPELINE_STEPS: readonly { id: PipelineColumn; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "estimate", label: "Estimate" },
  { id: "sow", label: "SOW" },
  { id: "complete", label: "Complete" },
];

export interface PipelineCard {
  id: string;
  name: string;
  clientName: string;
  pmName: string | null;
  nextAction: string;
  estimateTotal: { amount: number; currency: string } | null;
  /** Whole days since the project entered its current step. */
  daysInStep: number;
  needsReview: boolean;
}

export interface Pipeline {
  columns: Record<PipelineColumn, PipelineCard[]>;
}

export interface PipelineFilters {
  /** Only projects this user manages ("My projects"); null = all. */
  projectManagerId: string | null;
  clientId: string | null;
  workstreamId?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadPipeline(
  filters: PipelineFilters,
  db: Db = prisma,
  now: Date = new Date()
): Promise<Pipeline> {
  const projects = await db.project.findMany({
    where: {
      ...(filters.projectManagerId ? { projectManagerId: filters.projectManagerId } : {}),
      ...(filters.clientId ? { workstream: { clientId: filters.clientId } } : {}),
      ...(filters.workstreamId ? { workstreamId: filters.workstreamId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      currentStageNumber: true,
      scopeConfirmedAt: true,
      clarificationSentAt: true,
      briefAssessment: true,
      confirmedScopeVersion: { select: { id: true, versionNumber: true } },
      workstream: { select: { client: { select: { name: true } } } },
      projectManager: { select: { name: true } },
      capabilities: { select: { capability: true } },
      specialistInputs: { select: { capability: true, status: true } },
      estimateBrief: { select: { versions: { take: 1, select: { id: true } } } },
      briefAttributeValues: {
        select: {
          id: true,
          attributeId: true,
          kind: true,
          source: true,
          values: true,
          evidence: true,
          knowledgeItemId: true,
          createdAt: true,
        },
      },
      documents: {
        where: { type: { in: ["SCOPE_SUMMARY", "POSITION_DOCUMENT", "DRAFT_SCOPE_DOCUMENT"] } },
        select: {
          type: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { versionNumber: true, content: true },
          },
        },
      },
      estimates: {
        select: {
          id: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              id: true,
              totalValue: true,
              currency: true,
              createdAt: true,
              sourceScopeVersion: { select: { versionNumber: true } },
            },
          },
        },
      },
      sow: {
        select: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              id: true,
              sourceEstimateVersionId: true,
              sourceEstimateVersion: { select: { estimateId: true } },
            },
          },
        },
      },
      commercialApprovals: {
        where: { revokedAt: null },
        select: {
          documentType: true,
          recordedAt: true,
          sowVersionId: true,
          estimateVersion: { select: { totalValue: true, currency: true } },
        },
      },
    },
  });

  const columns: Record<PipelineColumn, PipelineCard[]> = {
    brief: [],
    estimate: [],
    sow: [],
    complete: [],
  };

  for (const p of projects) {
    const scopeDoc = p.documents.find((d) => d.type === "SCOPE_SUMMARY")?.versions[0] ?? null;
    const scopeContent = ScopeSummaryContentSchema.safeParse(scopeDoc?.content);
    const hasEarlier = p.documents.some((d) => d.type !== "SCOPE_SUMMARY" && d.versions.length > 0);
    const keyDetails = evaluateBriefCompleteness(
      p.briefAttributeValues
        .filter((row) => getBriefAttribute(row.attributeId))
        .map((row) => ({ ...row, createdByName: null })),
      { currentStageNumber: p.currentStageNumber }
    );
    const estimateApproval =
      p.commercialApprovals.find((a) => a.documentType === "ESTIMATE") ?? null;
    const sowApproval = p.commercialApprovals.find((a) => a.documentType === "SOW") ?? null;
    const latestEstimates = p.estimates
      .map((e) => ({ estimateId: e.id, latest: e.versions[0] }))
      .filter((e) => e.latest);
    const latestSow = p.sow?.versions[0] ?? null;

    const confirmedNumber = p.confirmedScopeVersion?.versionNumber ?? null;
    const estimateStale = latestEstimates.some(
      (e) =>
        confirmedNumber !== null &&
        e.latest.sourceScopeVersion !== null &&
        confirmedNumber > e.latest.sourceScopeVersion.versionNumber
    );
    const sowSourceEstimate = latestSow?.sourceEstimateVersion?.estimateId ?? null;
    const sowStale =
      latestSow !== null &&
      sowSourceEstimate !== null &&
      latestEstimates.some(
        (e) =>
          e.estimateId === sowSourceEstimate && e.latest.id !== latestSow.sourceEstimateVersionId
      );

    const statuses = deriveStepStatuses({
      scopeConfirmedAt: p.scopeConfirmedAt,
      hasApprovedEstimate: estimateApproval !== null,
      hasEstimateWork:
        latestEstimates.length > 0 ||
        (p.estimateBrief?.versions.length ?? 0) > 0 ||
        p.specialistInputs.length > 0,
      hasApprovedSow: sowApproval !== null,
      hasSowVersion: latestSow !== null,
    });
    const complete = isProjectComplete(statuses);
    const step = getCurrentStepId(statuses);
    const confirmedCapabilities = new Set(p.capabilities.map((c) => c.capability));
    const specialistRows = p.specialistInputs.filter((i) =>
      confirmedCapabilities.has(i.capability)
    );

    const action = deriveNextAction({
      projectId: p.id,
      projectComplete: complete,
      approvedSowHref: sowApproval?.sowVersionId
        ? `/api/projects/${p.id}/sow/${sowApproval.sowVersionId}`
        : null,
      hasScopeSummary: scopeDoc !== null,
      hasEarlierDocuments: hasEarlier,
      openQuestions:
        (scopeContent.success ? scopeContent.data.openQuestions.length : 0) +
        keyDetails.requiredOutstanding.length,
      clarificationSent: p.clarificationSentAt !== null,
      briefAssessment: normaliseBriefAssessment(p.briefAssessment)?.level ?? null,
      scopeConfirmed: p.scopeConfirmedAt !== null,
      scopeNewerThanConfirmed:
        scopeDoc !== null && confirmedNumber !== null && scopeDoc.versionNumber > confirmedNumber,
      capabilityCount: confirmedCapabilities.size,
      hasEstimateBrief: (p.estimateBrief?.versions.length ?? 0) > 0,
      specialistReceived: specialistRows.filter((r) => r.status === "received").length,
      specialistTotal: confirmedCapabilities.size,
      hasEstimate: latestEstimates.length > 0,
      estimateStale,
      estimateApproved: estimateApproval !== null,
      hasSow: latestSow !== null,
      sowStale,
      sowApproved: sowApproval !== null,
    });

    // When the project entered its current step.
    const enteredAt = complete
      ? (sowApproval?.recordedAt ?? p.createdAt)
      : step === "brief"
        ? p.createdAt
        : step === "estimate"
          ? (p.scopeConfirmedAt ?? p.createdAt)
          : (estimateApproval?.recordedAt ?? p.scopeConfirmedAt ?? p.createdAt);

    const shownEstimate =
      estimateApproval?.estimateVersion ??
      latestEstimates
        .map((e) => e.latest)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null;

    columns[complete ? "complete" : step].push({
      id: p.id,
      name: p.name,
      clientName: p.workstream.client.name,
      pmName: p.projectManager?.name ?? null,
      nextAction: action.title,
      estimateTotal: shownEstimate
        ? { amount: Number(shownEstimate.totalValue), currency: shownEstimate.currency }
        : null,
      daysInStep: Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / DAY_MS)),
      needsReview: estimateStale || sowStale,
    });
  }

  return { columns };
}
