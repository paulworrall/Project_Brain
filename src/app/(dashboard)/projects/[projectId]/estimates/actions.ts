"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";
import {
  RateCardLineItemAgentError,
  parseRateCardLineItems,
} from "@/services/agents/rate-card-line-item-agent";
import {
  EstimateRoleExtractionError,
  extractEstimateRoles,
} from "@/services/agents/estimate-role-extraction-agent";
import {
  EstimateRoleMatchingError,
  matchRolesAgainstRateCard,
  type RateCardLineCandidate,
} from "@/services/agents/estimate-role-matching-agent";
import { resolveMatchRouting } from "@/lib/estimateMatching";
import { ROLE_MATCH_CONFIDENCE_THRESHOLD } from "@/lib/estimateMatchingConfig";
import { buildEstimateContentDraft } from "@/lib/estimateContentDraft";
import { getEstimateBuildViewData, type EstimateBuildViewData } from "@/lib/estimateBuildViewData";
import { renderEstimateDocumentDocx } from "@/services/documents/estimate-document-docx";
import { parseEstimateUnit } from "@/lib/estimateUnits";
import { EstimateUnit } from "@/generated/prisma/enums";

const EstimateUnitSchema = z.enum(EstimateUnit, { error: "Choose hours, days or weeks." });

export interface ActionState {
  message?: string;
}

/**
 * Returned by every build-flow action (create/add-input/analyze/resolve) —
 * the full current state of one Estimate's build workspace, so a caller
 * driving the whole flow client-side (the "New estimate" modal) can update
 * its own local state directly from the action's result instead of relying
 * on a page navigation or revalidatePath reaching a route it never visits.
 */
export interface EstimateBuildActionState extends ActionState {
  view?: EstimateBuildViewData;
}

// ---------------------------------------------------------------------------
// Create an estimate track
// ---------------------------------------------------------------------------

const CreateEstimateSchema = z.object({
  label: z.string().trim().min(1, { error: "Give this estimate a short label." }),
  rateCardVersionId: z
    .string({ error: "Select a rate card." })
    .trim()
    .min(1, { error: "Select a rate card." }),
});

export interface CreateEstimateActionState extends EstimateBuildActionState {
  estimateId?: string;
  label?: string;
  rateCardLabel?: string;
}

/**
 * Starts a new Estimate track, locked for its whole life to the chosen
 * RateCardVersion (not just the parent RateCard — pricing needs one
 * version's actual lines). Re-validates server-side that the submitted
 * version actually belongs to a rate card under this project's own client —
 * the same isolation pattern used elsewhere for rate cards (see
 * updateProjectSummaryAction), never trusting the already-scoped dropdown
 * alone. Returns the new estimate's id and its (trivially empty) build view
 * rather than redirecting, so the "New estimate" modal can drive the whole
 * build flow itself without ever navigating to the estimate's own page.
 */
export async function createEstimateAction(
  projectId: string,
  _prevState: CreateEstimateActionState | undefined,
  formData: FormData
): Promise<CreateEstimateActionState> {
  const parsed = CreateEstimateSchema.safeParse({
    label: formData.get("label"),
    rateCardVersionId: formData.get("rateCardVersionId"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      message: errors.label?.[0] ?? errors.rateCardVersionId?.[0] ?? "Invalid estimate details.",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workstream: { select: { clientId: true } } },
  });
  const validRateCardVersion = project
    ? await prisma.rateCardVersion.findFirst({
        where: {
          id: parsed.data.rateCardVersionId,
          rateCard: { clientId: project.workstream.clientId },
        },
        select: { id: true, versionNumber: true, rateCard: { select: { name: true } } },
      })
    : null;
  if (!validRateCardVersion) {
    return { message: "Selected rate card is not valid for this client." };
  }

  const session = await auth();

  const estimate = await prisma.estimate.create({
    data: {
      projectId,
      label: parsed.data.label,
      rateCardVersionId: validRateCardVersion.id,
      createdById: session?.user?.id,
    },
  });

  const view = await getEstimateBuildViewData(estimate.id);

  revalidatePath(`/projects/${projectId}`);
  return {
    estimateId: estimate.id,
    label: estimate.label,
    rateCardLabel: `${validRateCardVersion.rateCard.name} (version ${validRateCardVersion.versionNumber})`,
    view: view ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Add a role — capture raw content and immediately extract + match it
// ---------------------------------------------------------------------------

const RoleInputSchema = z.object({
  content: z.string().trim().optional(),
});

/**
 * Adds one raw batch of pasted/uploaded estimate content and immediately
 * runs the full extraction + matching pipeline against it in the same
 * request — there's no separate manual "Analyze & build" step, and no
 * "revise this capability's input" concept (capability isn't a property of
 * the batch anymore, see RoleResolution.capability) — every submission is
 * simply appended. Lazily parses+caches the locked rate card version's
 * lines (once per version, unchanged from the old two-step flow).
 *
 * Atomic from the user's point of view: if extraction or matching fails
 * after the EstimateCapabilityInput row is created, that row is deleted
 * before returning the error — a failed submission must not leave an
 * orphaned, never-surfaced row behind now that there's no "Re-analyze"
 * button left to retry it.
 */
export async function addEstimateRoleInputAction(
  estimateId: string,
  _prevState: EstimateBuildActionState | undefined,
  formData: FormData
): Promise<EstimateBuildActionState> {
  const parsed = RoleInputSchema.safeParse({
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { message: "Invalid input." };
  }

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  const hasPastedText = !!parsed.data.content;

  if (!hasFile && !hasPastedText) {
    return { message: "Paste some notes or upload a file." };
  }
  if (hasFile && hasPastedText) {
    return { message: "Provide either pasted content or a file, not both." };
  }

  const session = await auth();

  let rawContent: string;
  let sourceFileName: string | null = null;

  if (hasFile && file instanceof File) {
    sourceFileName = file.name;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      rawContent = await parseDocumentToText(buffer, file.name);
    } catch (error) {
      if (error instanceof UnsupportedBriefFormatError) {
        return { message: error.message };
      }
      return { message: "Couldn't read that file. Try pasting the content instead." };
    }
  } else {
    rawContent = parsed.data.content!;
  }

  if (rawContent.trim().length === 0) {
    return { message: "That input appears to be empty." };
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { rateCardVersion: true },
  });
  if (!estimate) {
    return { message: "Estimate not found." };
  }

  let lineItemCount = await prisma.rateCardLineItem.count({
    where: { rateCardVersionId: estimate.rateCardVersionId },
  });
  if (lineItemCount === 0) {
    let parsedLines;
    try {
      parsedLines = await parseRateCardLineItems(estimate.rateCardVersion.extractedText);
    } catch (error) {
      if (error instanceof RateCardLineItemAgentError) {
        return { message: error.message };
      }
      throw error;
    }
    if (parsedLines.length > 0) {
      await prisma.rateCardLineItem.createMany({
        data: parsedLines.map((line) => ({
          rateCardVersionId: estimate.rateCardVersionId,
          role: line.role,
          level: line.level,
          rateType: line.rateType,
          rate: line.rate,
          currency: line.currency,
        })),
      });
    }
    lineItemCount = parsedLines.length;
  }

  const candidateLines: RateCardLineCandidate[] = await prisma.rateCardLineItem.findMany({
    where: { rateCardVersionId: estimate.rateCardVersionId },
    select: { id: true, role: true, level: true },
  });

  const input = await prisma.estimateCapabilityInput.create({
    data: {
      estimateId,
      source: hasFile ? "FILE" : "PASTE",
      rawContent,
      sourceFileName,
      addedById: session?.user?.id,
    },
  });

  let extractedRoles;
  try {
    extractedRoles = await extractEstimateRoles(rawContent);
  } catch (error) {
    await prisma.estimateCapabilityInput.delete({ where: { id: input.id } });
    if (error instanceof EstimateRoleExtractionError) {
      return { message: error.message };
    }
    throw error;
  }

  if (extractedRoles.length === 0) {
    await prisma.estimateCapabilityInput.delete({ where: { id: input.id } });
    return {
      message:
        "No roles could be identified in that input — try rephrasing or check the file content.",
    };
  }

  let matchResults;
  try {
    matchResults = await matchRolesAgainstRateCard(extractedRoles, candidateLines);
  } catch (error) {
    await prisma.estimateCapabilityInput.delete({ where: { id: input.id } });
    if (error instanceof EstimateRoleMatchingError) {
      return { message: error.message };
    }
    throw error;
  }
  const matchByRawText = new Map(matchResults.map((m) => [m.rawRoleText, m]));

  await prisma.$transaction(
    extractedRoles.map((role) => {
      const match = matchByRawText.get(role.rawRoleText) ?? {
        matchType: "NO_MATCH" as const,
        confidence: 0,
        suggestedRateCardLineId: null,
      };
      const { autoResolve } = resolveMatchRouting(match, ROLE_MATCH_CONFIDENCE_THRESHOLD);

      return prisma.roleResolution.create({
        data: {
          estimateId,
          estimateCapabilityInputId: input.id,
          capability: role.extractedCapability,
          rawRoleText: role.rawRoleText,
          extractedRole: role.extractedRole,
          extractedLevel: role.extractedLevel,
          extractedQuantity: role.quantity,
          // null (missing/ambiguous) holds the role for PM review — never defaulted to hours.
          extractedUnit: parseEstimateUnit(role.unit),
          rawUnitText: role.rawUnitText ?? role.unit,
          matchType: match.matchType,
          confidence: match.confidence,
          suggestedRateCardLineId: match.suggestedRateCardLineId,
          resolvedRateCardLineId: autoResolve ? match.suggestedRateCardLineId : null,
          resolvedAt: autoResolve ? new Date() : null,
        },
      });
    })
  );

  revalidatePath(`/projects/${estimate.projectId}/estimates/${estimateId}`);
  const view = await getEstimateBuildViewData(estimateId);
  return { view: view ?? undefined };
}

// ---------------------------------------------------------------------------
// Update the quantity of an already-resolved role
// ---------------------------------------------------------------------------

const UpdateQuantitySchema = z.object({
  quantity: z.coerce
    .number({ error: "Enter a valid quantity." })
    .positive({ error: "Quantity must be greater than zero." }),
  // Optional: omitted keeps the role's current unit.
  unit: EstimateUnitSchema.optional(),
});

/**
 * Lets a PM correct an already-resolved role's allocated quantity and/or
 * unit (e.g. 20 hours -> 40 hours, or 5 days -> 1 week) without re-running
 * extraction/matching — role, level, and the matched rate card line are
 * already confirmed and stay fixed. buildEstimateContentDraft recomputes every
 * fee/total from extractedQuantity on every call, so the fresh view
 * returned here already reflects the new numbers.
 */
export async function updateRoleResolutionQuantityAction(
  roleResolutionId: string,
  _prevState: EstimateBuildActionState | undefined,
  formData: FormData
): Promise<EstimateBuildActionState> {
  const parsed = UpdateQuantitySchema.safeParse({
    quantity: formData.get("quantity"),
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { message: errors.quantity?.[0] ?? errors.unit?.[0] ?? "Enter a valid quantity." };
  }

  const roleResolution = await prisma.roleResolution.findUnique({
    where: { id: roleResolutionId },
    select: { estimateId: true, resolvedAt: true },
  });
  if (!roleResolution) {
    return { message: "Role not found." };
  }
  if (!roleResolution.resolvedAt) {
    return { message: "This role must be resolved before its quantity can be updated." };
  }

  await prisma.roleResolution.update({
    where: { id: roleResolutionId },
    data: {
      extractedQuantity: parsed.data.quantity,
      ...(parsed.data.unit ? { extractedUnit: parsed.data.unit } : {}),
    },
  });

  const estimate = await prisma.estimate.findUnique({
    where: { id: roleResolution.estimateId },
    select: { projectId: true },
  });
  if (estimate) {
    revalidatePath(`/projects/${estimate.projectId}/estimates/${roleResolution.estimateId}`);
  }

  const view = await getEstimateBuildViewData(roleResolution.estimateId);
  return { view: view ?? undefined };
}

// ---------------------------------------------------------------------------
// Resolve one pending role
// ---------------------------------------------------------------------------

const ResolveRoleSchema = z.object({
  rateCardLineItemId: z.string().trim().min(1, { error: "Choose a rate card line." }),
  // Required only when the role has no unit yet; otherwise optional (a correction).
  unit: EstimateUnitSchema.optional(),
});

/**
 * A PM confirms or overrides one pending RoleResolution — its rate card
 * line, and its unit when that was missing/ambiguous (required then). Re-validates
 * server-side that the chosen line belongs to this estimate's locked rate
 * card version — defense in depth beyond the review UI's own scoped
 * dropdown.
 */
export async function resolveRoleResolutionAction(
  roleResolutionId: string,
  _prevState: EstimateBuildActionState | undefined,
  formData: FormData
): Promise<EstimateBuildActionState> {
  const parsed = ResolveRoleSchema.safeParse({
    rateCardLineItemId: formData.get("rateCardLineItemId"),
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { message: errors.unit?.[0] ?? "Choose a rate card line before confirming." };
  }

  const roleResolution = await prisma.roleResolution.findUnique({
    where: { id: roleResolutionId },
    include: { estimate: { select: { rateCardVersionId: true, projectId: true } } },
  });
  if (!roleResolution) {
    return { message: "Role resolution not found." };
  }
  const unit = parsed.data.unit ?? roleResolution.extractedUnit;
  if (!unit) {
    return {
      message: "Choose the unit (hours, days or weeks) this quantity is in before confirming.",
    };
  }

  const validLine = await prisma.rateCardLineItem.findFirst({
    where: {
      id: parsed.data.rateCardLineItemId,
      rateCardVersionId: roleResolution.estimate.rateCardVersionId,
    },
    select: { id: true },
  });
  if (!validLine) {
    return { message: "That line doesn't belong to this estimate's rate card." };
  }

  const session = await auth();

  await prisma.roleResolution.update({
    where: { id: roleResolutionId },
    data: {
      resolvedRateCardLineId: validLine.id,
      extractedUnit: unit,
      resolvedById: session?.user?.id,
      resolvedAt: new Date(),
    },
  });

  revalidatePath(
    `/projects/${roleResolution.estimate.projectId}/estimates/${roleResolution.estimateId}`
  );
  const view = await getEstimateBuildViewData(roleResolution.estimateId);
  return { view: view ?? undefined };
}

// ---------------------------------------------------------------------------
// Save as version
// ---------------------------------------------------------------------------

export interface SaveEstimateVersionActionState extends EstimateBuildActionState {
  versionId?: string;
}

/**
 * Writes a new, immutable EstimateVersion + its EstimateLineItems.
 * Server-side gate, never trusting client state: refuses if any
 * RoleResolution for this Estimate is still unresolved, or if the resolved
 * lines span more than one currency. Recomputes every fee/total from
 * scratch here — the agent never computes or states a total itself.
 */
export async function saveEstimateVersionAction(
  estimateId: string,
  _prevState: SaveEstimateVersionActionState | undefined,
  _formData: FormData
): Promise<SaveEstimateVersionActionState> {
  const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
  if (!estimate) {
    return { message: "Estimate not found." };
  }

  const draft = await buildEstimateContentDraft(estimateId);
  if ("message" in draft) {
    return { message: draft.message };
  }
  const {
    content,
    lineItems,
    totalValue,
    currency,
    description,
    capabilitiesIncluded,
    conversionFactors,
  } = draft;

  const session = await auth();

  const fileBytes = new Uint8Array(await renderEstimateDocumentDocx(content));
  const fileName = `Estimate - ${estimate.label} - ${content.overview.generatedDate}.docx`;

  const latestVersion = await prisma.estimateVersion.findFirst({
    where: { estimateId },
    orderBy: { versionNumber: "desc" },
  });

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.estimateVersion.create({
      data: {
        estimateId,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        rateCardVersionId: estimate.rateCardVersionId,
        capabilitiesIncluded,
        totalValue,
        currency,
        // Recorded so this version stays reproducible if the factors change later.
        hoursPerDay: conversionFactors.hoursPerDay,
        daysPerWeek: conversionFactors.daysPerWeek,
        description,
        fileName,
        fileBytes,
        content,
        createdById: session?.user?.id,
      },
    });

    await tx.estimateLineItem.createMany({
      data: lineItems.map((item) => ({
        ...item,
        estimateVersionId: created.id,
      })),
    });

    return created;
  });

  revalidatePath(`/projects/${estimate.projectId}/estimates/${estimateId}`);
  const view = await getEstimateBuildViewData(estimateId);
  return { versionId: version.id, view: view ?? undefined };
}
