import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Capability, EstimateUnit, RateType } from "@/generated/prisma/enums";
import {
  buildEstimateDescription,
  computeEstimateTotals,
  computeLineItemFee,
} from "@/services/pricing/estimate-pricing";
import { getConversionFactors, type ConversionFactors } from "@/services/pricing/unit-conversion";
import type { EstimateDocumentContent } from "@/types/estimates";

/**
 * A RoleResolution needs a PM before it can be priced when EITHER its rate
 * card line is unconfirmed OR its unit is missing/ambiguous (never
 * defaulted to hours). The one definition of "pending" — shared by the
 * save gate below and the review list (estimateBuildViewData.ts) so they
 * can never disagree.
 */
export function roleNeedsReviewWhere(estimateId: string): Prisma.RoleResolutionWhereInput {
  return { estimateId, OR: [{ resolvedAt: null }, { extractedUnit: null }] };
}

export interface EstimateLineItemDraft {
  capability: Capability;
  role: string;
  level: string | null;
  rateType: RateType;
  rate: Prisma.Decimal;
  quantity: Prisma.Decimal;
  unit: EstimateUnit;
  rawUnitText: string | null;
  hours: Prisma.Decimal;
  feeSubtotal: Prisma.Decimal;
  roleResolutionId: string;
  rateCardLineItemId: string;
}

export interface EstimateContentDraft {
  content: EstimateDocumentContent;
  lineItems: EstimateLineItemDraft[];
  totalValue: Prisma.Decimal;
  currency: string;
  description: string;
  capabilitiesIncluded: Capability[];
  /** The factors every fee here was priced at — stored on the saved version. */
  conversionFactors: ConversionFactors;
}

/**
 * Computes what an Estimate's next version WOULD contain, from its
 * currently resolved roles — deterministic, no LLM call, no writes. Shared
 * by two callers that must never drift apart: saveEstimateVersionAction
 * (persists this) and the review page (previews it before the PM commits).
 * Returns a plain { message } on any condition that should block either
 * caller — pending resolutions (including a missing unit), no resolved
 * roles yet, or mixed currencies. Every fee is priced from hours at the
 * factors getConversionFactors() resolves for this project.
 */
export async function buildEstimateContentDraft(
  estimateId: string
): Promise<EstimateContentDraft | { message: string }> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      project: { include: { workstream: { include: { client: true } } } },
      rateCardVersion: { include: { rateCard: true } },
    },
  });
  if (!estimate) {
    return { message: "Estimate not found." };
  }

  const pendingCount = await prisma.roleResolution.count({
    where: roleNeedsReviewWhere(estimateId),
  });
  if (pendingCount > 0) {
    return {
      message: `${pendingCount} role${pendingCount === 1 ? "" : "s"} still need${
        pendingCount === 1 ? "s" : ""
      } your review before this can be saved.`,
    };
  }

  const resolvedRoles = await prisma.roleResolution.findMany({
    where: { estimateId, resolvedAt: { not: null } },
    include: { resolvedRateCardLine: true },
  });
  if (resolvedRoles.length === 0) {
    return { message: "Add at least one role to get started." };
  }

  const currencies = new Set(
    resolvedRoles.map((r) => r.resolvedRateCardLine?.currency).filter(Boolean)
  );
  if (currencies.size > 1) {
    return {
      message: `This estimate's resolved roles span more than one currency (${[...currencies].join(", ")}) — this isn't supported yet.`,
    };
  }
  const currency = [...currencies][0] ?? estimate.rateCardVersion.rateCard.currency ?? "GBP";

  const conversionFactors = await getConversionFactors({
    id: estimate.project.id,
    clientId: estimate.project.workstream.clientId,
  });

  const lineItems: EstimateLineItemDraft[] = resolvedRoles.map((role) => {
    const line = role.resolvedRateCardLine!;
    // Non-null: the pending gate above already excluded any role without a unit.
    const unit = role.extractedUnit!;
    const { hours, fee: feeSubtotal } = computeLineItemFee(
      { quantity: role.extractedQuantity, unit, rate: line.rate, rateType: line.rateType },
      conversionFactors
    );
    return {
      capability: role.capability,
      role: line.role,
      level: line.level,
      rateType: line.rateType,
      rate: line.rate,
      quantity: role.extractedQuantity,
      unit,
      rawUnitText: role.rawUnitText,
      hours,
      feeSubtotal,
      roleResolutionId: role.id,
      rateCardLineItemId: line.id,
    };
  });

  const totalValue = computeEstimateTotals(lineItems);
  const capabilitiesIncluded = [...new Set(lineItems.map((i) => i.capability))];
  const description = buildEstimateDescription(capabilitiesIncluded);

  const bySection = new Map<Capability, EstimateLineItemDraft[]>();
  for (const item of lineItems) {
    bySection.set(item.capability, [...(bySection.get(item.capability) ?? []), item]);
  }

  const content: EstimateDocumentContent = {
    overview: {
      clientName: estimate.project.workstream.client.name,
      projectName: estimate.project.name,
      projectCode: estimate.project.jobCode,
      generatedDate: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      rateCardName: estimate.rateCardVersion.rateCard.name,
      rateCardVersionNumber: estimate.rateCardVersion.versionNumber,
    },
    capabilitySections: [...bySection.entries()].map(([capability, items]) => ({
      capability,
      lineItems: items.map((i) => ({
        role: i.role,
        level: i.level,
        rateType: i.rateType,
        rate: Number(i.rate),
        quantity: Number(i.quantity),
        unit: i.unit,
        hours: Number(i.hours),
        feeSubtotal: Number(i.feeSubtotal),
        roleResolutionId: i.roleResolutionId,
        rateCardLineItemId: i.rateCardLineItemId,
      })),
      subtotal: computeEstimateTotals(items).toNumber(),
    })),
    currency,
    totalValue: totalValue.toNumber(),
    hoursPerDay: conversionFactors.hoursPerDay,
    daysPerWeek: conversionFactors.daysPerWeek,
  };

  return {
    content,
    lineItems,
    totalValue,
    currency,
    description,
    capabilitiesIncluded,
    conversionFactors,
  };
}
