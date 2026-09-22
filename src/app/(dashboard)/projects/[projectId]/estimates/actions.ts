"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";
import { CapabilityEnum } from "@/types/capabilities";
import {
  RateCardLineItemAgentError,
  parseRateCardLineItems,
} from "@/services/agents/rate-card-line-item-agent";
import {
  EstimateRoleExtractionError,
  extractRolesFromCapabilityInput,
} from "@/services/agents/estimate-role-extraction-agent";
import {
  EstimateRoleMatchingError,
  matchRolesAgainstRateCard,
  type RateCardLineCandidate,
} from "@/services/agents/estimate-role-matching-agent";
import { resolveMatchRouting } from "@/lib/estimateMatching";
import { ROLE_MATCH_CONFIDENCE_THRESHOLD } from "@/lib/estimateMatchingConfig";
import { buildEstimateContentDraft } from "@/lib/estimateContentDraft";
import { renderEstimateDocumentDocx } from "@/services/documents/estimate-document-docx";

export interface ActionState {
  message?: string;
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

/**
 * Starts a new Estimate track, locked for its whole life to the chosen
 * RateCardVersion (not just the parent RateCard — pricing needs one
 * version's actual lines). Re-validates server-side that the submitted
 * version actually belongs to a rate card under this project's own client —
 * the same isolation pattern used elsewhere for rate cards (see
 * updateProjectSummaryAction), never trusting the already-scoped dropdown
 * alone.
 */
export async function createEstimateAction(
  projectId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = CreateEstimateSchema.safeParse({
    label: formData.get("label"),
    rateCardVersionId: formData.get("rateCardVersionId"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { message: errors.label?.[0] ?? errors.rateCardVersionId?.[0] ?? "Invalid estimate details." };
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
        select: { id: true },
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

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/estimates/${estimate.id}`);
}

// ---------------------------------------------------------------------------
// Add or revise a capability's input
// ---------------------------------------------------------------------------

const CapabilityInputSchema = z
  .object({
    capability: z.union([CapabilityEnum, z.literal("OTHER")], {
      error: "Choose which capability this estimate input is from.",
    }),
    otherLabel: z.string().trim().optional(),
    content: z.string().trim().optional(),
  })
  .refine((data) => data.capability !== "OTHER" || !!data.otherLabel, {
    error: 'Name the capability team when selecting "Other".',
    path: ["otherLabel"],
  });

/**
 * Upsert-by-capability, revised in place — adding a new capability's input
 * and replacing an existing one are both this same action; neither creates
 * an EstimateVersion. Reuses parseDocumentToText for file uploads, same
 * try/catch pattern as uploadKnowledgeItemAction. Revising an existing
 * input deletes its stale RoleResolution rows — extracted roles from the
 * old text must not silently keep counting as resolved.
 */
export async function addOrReviseCapabilityInputAction(
  estimateId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = CapabilityInputSchema.safeParse({
    capability: formData.get("capability"),
    otherLabel: formData.get("otherLabel") || undefined,
    content: formData.get("content"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { message: errors.capability?.[0] ?? errors.otherLabel?.[0] ?? "Invalid capability input." };
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

  const capability = parsed.data.capability === "OTHER" ? null : parsed.data.capability;
  const otherLabel = parsed.data.capability === "OTHER" ? parsed.data.otherLabel! : null;

  const existing = await prisma.estimateCapabilityInput.findFirst({
    where: { estimateId, capability },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.roleResolution.deleteMany({ where: { estimateCapabilityInputId: existing.id } });
      await tx.estimateCapabilityInput.update({
        where: { id: existing.id },
        data: {
          otherLabel,
          source: hasFile ? "FILE" : "PASTE",
          rawContent,
          sourceFileName,
          addedById: session?.user?.id,
        },
      });
    } else {
      await tx.estimateCapabilityInput.create({
        data: {
          estimateId,
          capability,
          otherLabel,
          source: hasFile ? "FILE" : "PASTE",
          rawContent,
          sourceFileName,
          addedById: session?.user?.id,
        },
      });
    }
  });

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { projectId: true },
  });
  if (estimate) {
    revalidatePath(`/projects/${estimate.projectId}/estimates/${estimateId}`);
  }
}

// ---------------------------------------------------------------------------
// Analyze & build — parse, extract, match, surface pending resolutions
// ---------------------------------------------------------------------------

export interface AnalyzeAndBuildActionState extends ActionState {
  pendingCount?: number;
}

/**
 * Runs the estimate-analysis pipeline: lazily parses the locked rate card
 * version's lines (once, cached — see rate-card-line-item-agent.ts), then
 * for every capability input that hasn't been analyzed yet (has zero
 * RoleResolution rows), extracts roles and matches them against the rate
 * card. Auto-resolved rows (per the conservative gate in
 * estimateMatching.ts) get resolvedAt set immediately with resolvedById
 * null, to distinguish a system resolution from a PM's explicit choice;
 * everything else is created pending, for RoleResolutionReview to surface.
 */
export async function analyzeAndBuildEstimateAction(
  estimateId: string,
  _prevState: AnalyzeAndBuildActionState | undefined,
  _formData: FormData
): Promise<AnalyzeAndBuildActionState> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      rateCardVersion: true,
      capabilityInputs: { include: { roleResolutions: { select: { id: true } } } },
    },
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

  const pendingInputs = estimate.capabilityInputs.filter((input) => input.roleResolutions.length === 0);

  for (const input of pendingInputs) {
    let extractedRoles;
    try {
      extractedRoles = await extractRolesFromCapabilityInput(
        input.rawContent,
        input.capability ?? "CLIENT_ENGAGEMENT_AND_DELIVERY"
      );
    } catch (error) {
      if (error instanceof EstimateRoleExtractionError) {
        return { message: error.message };
      }
      throw error;
    }

    if (extractedRoles.length === 0) {
      continue;
    }

    let matchResults;
    try {
      matchResults = await matchRolesAgainstRateCard(extractedRoles, candidateLines);
    } catch (error) {
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
            rawRoleText: role.rawRoleText,
            extractedRole: role.extractedRole,
            extractedLevel: role.extractedLevel,
            extractedQuantity: role.quantity,
            extractedUnit: role.unit,
            matchType: match.matchType,
            confidence: match.confidence,
            suggestedRateCardLineId: match.suggestedRateCardLineId,
            resolvedRateCardLineId: autoResolve ? match.suggestedRateCardLineId : null,
            resolvedAt: autoResolve ? new Date() : null,
          },
        });
      })
    );
  }

  const pendingCount = await prisma.roleResolution.count({
    where: { estimateId, resolvedAt: null },
  });

  revalidatePath(`/projects/${estimate.projectId}/estimates/${estimateId}`);
  return { pendingCount };
}

// ---------------------------------------------------------------------------
// Resolve one pending role
// ---------------------------------------------------------------------------

const ResolveRoleSchema = z.object({
  rateCardLineItemId: z.string().trim().min(1, { error: "Choose a rate card line." }),
});

/**
 * A PM confirms or overrides one pending RoleResolution. Re-validates
 * server-side that the chosen line belongs to this estimate's locked rate
 * card version — defense in depth beyond the review UI's own scoped
 * dropdown.
 */
export async function resolveRoleResolutionAction(
  roleResolutionId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const parsed = ResolveRoleSchema.safeParse({
    rateCardLineItemId: formData.get("rateCardLineItemId"),
  });
  if (!parsed.success) {
    return { message: "Choose a rate card line before confirming." };
  }

  const roleResolution = await prisma.roleResolution.findUnique({
    where: { id: roleResolutionId },
    include: { estimate: { select: { rateCardVersionId: true, projectId: true } } },
  });
  if (!roleResolution) {
    return { message: "Role resolution not found." };
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
      resolvedById: session?.user?.id,
      resolvedAt: new Date(),
    },
  });

  revalidatePath(
    `/projects/${roleResolution.estimate.projectId}/estimates/${roleResolution.estimateId}`
  );
}

// ---------------------------------------------------------------------------
// Save as version
// ---------------------------------------------------------------------------

export interface SaveEstimateVersionActionState extends ActionState {
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
  const { content, lineItems, totalValue, currency, description, capabilitiesIncluded } = draft;

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
  return { versionId: version.id };
}
