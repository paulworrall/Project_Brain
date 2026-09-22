import { prisma } from "@/lib/prisma";
import { buildEstimateContentDraft } from "@/lib/estimateContentDraft";
import type { EstimateCapabilityInputView } from "@/components/features/BuildEstimateInputForm";
import type { PendingRoleResolutionView, RateCardLineOption } from "@/components/features/RoleResolutionReview";
import type { EstimateDocumentContent } from "@/types/estimates";

export interface EstimateBuildViewData {
  existingInputs: EstimateCapabilityInputView[];
  pendingResolutions: PendingRoleResolutionView[];
  rateCardLines: RateCardLineOption[];
  reviewContent: EstimateDocumentContent | null;
}

/**
 * Assembles everything EstimateBuildWorkspace needs to render one Estimate's
 * current state. Shared by the estimate detail page (server render on first
 * load) and every build-flow Server Action (create/add-input/analyze/
 * resolve) — actions return this same shape so a caller driving the whole
 * flow client-side (e.g. the "New estimate" modal) never needs to navigate
 * to that page or trust a stale revalidatePath to reach it.
 */
export async function getEstimateBuildViewData(estimateId: string): Promise<EstimateBuildViewData | null> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      capabilityInputs: { orderBy: { addedAt: "asc" } },
      roleResolutions: {
        where: { resolvedAt: null },
        include: {
          estimateCapabilityInput: { select: { capability: true, otherLabel: true } },
          suggestedRateCardLine: true,
        },
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

  // buildEstimateContentDraft returns { message } instead of content
  // whenever there are pending resolutions or nothing resolved yet — both
  // cases where the caller shouldn't show a review card.
  const draft = await buildEstimateContentDraft(estimateId);
  const reviewContent = "content" in draft ? draft.content : null;

  return {
    existingInputs: estimate.capabilityInputs.map((input) => ({
      capability: input.capability,
      otherLabel: input.otherLabel,
      rawContent: input.rawContent,
      sourceFileName: input.sourceFileName,
    })),
    pendingResolutions: estimate.roleResolutions.map((resolution) => ({
      id: resolution.id,
      capability: resolution.estimateCapabilityInput.capability,
      otherLabel: resolution.estimateCapabilityInput.otherLabel,
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
  };
}
