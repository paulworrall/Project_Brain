import { prisma } from "@/lib/prisma";
import { buildEstimateContentDraft } from "@/lib/estimateContentDraft";
import type { PendingRoleResolutionView, RateCardLineOption } from "@/components/features/RoleResolutionReview";
import type { EstimateDocumentContent } from "@/types/estimates";

export interface EstimateBuildViewData {
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  reviewContent: EstimateDocumentContent | null;
  latestVersion: { id: string; versionNumber: number } | null;
}

/**
 * Assembles everything EstimateBuildWorkspace needs to render one Estimate's
 * current state. Shared by the estimate detail page (server render on first
 * load) and every build-flow Server Action (create/add-role/resolve/
 * update-quantity/save) — actions return this same shape so a caller
 * driving the whole flow client-side (e.g. the "New estimate" modal) never
 * needs to navigate to that page or trust a stale revalidatePath to reach
 * it.
 */
export async function getEstimateBuildViewData(estimateId: string): Promise<EstimateBuildViewData | null> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      roleResolutions: {
        where: { resolvedAt: null },
        include: { suggestedRateCardLine: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!estimate) {
    return null;
  }

  const rateCardLines = await prisma.rateCardLineItem.findMany({
    where: { rateCardVersionId: estimate.rateCardVersionId },
    orderBy: [{ role: "asc" }, { level: "asc" }],
  });

  const latestVersion = await prisma.estimateVersion.findFirst({
    where: { estimateId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });

  // buildEstimateContentDraft returns { message } instead of content
  // whenever there are pending resolutions or nothing resolved yet — both
  // cases where the caller shouldn't show a review card.
  const draft = await buildEstimateContentDraft(estimateId);
  const reviewContent = "content" in draft ? draft.content : null;

  return {
    pendingResolutions: estimate.roleResolutions.map((resolution) => ({
      id: resolution.id,
      capability: resolution.capability,
      rawRoleText: resolution.rawRoleText,
      extractedRole: resolution.extractedRole,
      extractedLevel: resolution.extractedLevel,
      extractedQuantity: Number(resolution.extractedQuantity),
      extractedUnit: resolution.extractedUnit,
      matchType: resolution.matchType,
      confidence: resolution.confidence,
      suggestedLine: resolution.suggestedRateCardLine
        ? {
            id: resolution.suggestedRateCardLine.id,
            role: resolution.suggestedRateCardLine.role,
            level: resolution.suggestedRateCardLine.level,
            rateType: resolution.suggestedRateCardLine.rateType,
            rate: Number(resolution.suggestedRateCardLine.rate),
            currency: resolution.suggestedRateCardLine.currency,
          }
        : null,
    })),
    rateCardLines: rateCardLines.map((line) => ({
      id: line.id,
      role: line.role,
      level: line.level,
      rateType: line.rateType,
      rate: Number(line.rate),
      currency: line.currency,
    })),
    reviewContent,
    latestVersion,
  };
}
