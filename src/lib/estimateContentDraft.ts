import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Capability } from "@/generated/prisma/enums";
import {
  buildEstimateDescription,
  computeEstimateTotals,
  computeLineItemFee,
} from "@/services/pricing/estimate-pricing";
import type { EstimateDocumentContent } from "@/types/estimates";

export interface EstimateLineItemDraft {
  capability: Capability;
  role: string;
  level: string | null;
  rateType: "HOURLY" | "DAILY" | "WEEKLY";
  rate: Prisma.Decimal;
  quantity: Prisma.Decimal;
  unit: string;
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
}

/**
 * Computes what an Estimate's next version WOULD contain, from its
 * currently resolved roles — deterministic, no LLM call, no writes. Shared
 * by two callers that must never drift apart: saveEstimateVersionAction
 * (persists this) and the review page (previews it before the PM commits).
 * Returns a plain { message } on any condition that should block either
 * caller — pending resolutions, no resolved roles yet, or mixed currencies.
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
    where: { estimateId, resolvedAt: null },
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

  const currencies = new Set(resolvedRoles.map((r) => r.resolvedRateCardLine?.currency).filter(Boolean));
  if (currencies.size > 1) {
    return {
      message: `This estimate's resolved roles span more than one currency (${[...currencies].join(", ")}) — this isn't supported yet.`,
    };
  }
  const currency = [...currencies][0] ?? estimate.rateCardVersion.rateCard.currency ?? "GBP";

  const lineItems: EstimateLineItemDraft[] = resolvedRoles.map((role) => {
    const line = role.resolvedRateCardLine!;
    const feeSubtotal = computeLineItemFee(role.extractedQuantity, line.rate);
    return {
      capability: role.capability,
      role: line.role,
      level: line.level,
      rateType: line.rateType,
      rate: line.rate,
      quantity: role.extractedQuantity,
      unit: role.extractedUnit,
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
        feeSubtotal: Number(i.feeSubtotal),
        roleResolutionId: i.roleResolutionId,
        rateCardLineItemId: i.rateCardLineItemId,
      })),
      subtotal: items.reduce((sum, i) => sum + Number(i.feeSubtotal), 0),
    })),
    currency,
    totalValue: totalValue.toNumber(),
  };

  return { content, lineItems, totalValue, currency, description, capabilitiesIncluded };
}
