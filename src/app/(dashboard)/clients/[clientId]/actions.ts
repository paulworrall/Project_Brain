"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement, CLIENT_ENGAGEMENT_ONLY_MESSAGE } from "@/lib/permissions";
import { extractTextFromBuffer } from "@/lib/extractTextFromBuffer";

export interface ActionState {
  message?: string;
}

function toDateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

const EffectiveDatesSchema = z.object({
  effectiveFrom: z.string().trim().min(1, { error: "Effective from date is required." }),
  effectiveTo: z.string().trim().optional(),
});

/**
 * Uploads a new MSA version for this Client — the shared document+version
 * pattern (see src/components/features/VersionHistory.tsx): disables
 * whichever version was current, creates a new one marked current. Also
 * creates the Client's MasterServiceAgreement "document" row on first
 * upload (upsert) — an MSA is a single, unnamed document per Client, so
 * there's no separate "create the document" step the way there is for Rate
 * Cards / SOW Templates.
 */
export async function uploadMasterServiceAgreementVersionAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsed = EffectiveDatesSchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo"),
  });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.effectiveFrom?.[0] ?? "Invalid MSA details.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Upload the MSA file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractTextFromBuffer(buffer, file.name);
  if ("message" in extracted) {
    return extracted;
  }

  await prisma.$transaction(async (tx) => {
    const msa = await tx.masterServiceAgreement.upsert({
      where: { clientId },
      update: {},
      create: { clientId },
    });

    await tx.masterServiceAgreementVersion.updateMany({
      where: { masterServiceAgreementId: msa.id, status: "ENABLED" },
      data: { status: "DISABLED" },
    });

    const latest = await tx.masterServiceAgreementVersion.findFirst({
      where: { masterServiceAgreementId: msa.id },
      orderBy: { versionNumber: "desc" },
    });

    await tx.masterServiceAgreementVersion.create({
      data: {
        masterServiceAgreementId: msa.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        fileName: file.name,
        fileBytes: buffer,
        extractedText: extracted.extractedText,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        effectiveTo: toDateOrNull(parsed.data.effectiveTo),
        status: "ENABLED",
        uploadedById: session!.user!.id,
      },
    });
  });

  revalidatePath(`/clients/${clientId}`);
}

/**
 * Reverts the Client's MSA to a previously-disabled version — re-enables it
 * and disables whatever was current before. Scoped by both the version id
 * and this Client's own MSA document, so a stale/tampered id can never
 * revert a different Client's agreement.
 */
export async function revertMasterServiceAgreementVersionAction(
  clientId: string,
  versionId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const msa = await prisma.masterServiceAgreement.findUnique({ where: { clientId } });
  const target = msa
    ? await prisma.masterServiceAgreementVersion.findFirst({
        where: { id: versionId, masterServiceAgreementId: msa.id },
      })
    : null;
  if (!msa || !target) {
    return { message: "Version not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.masterServiceAgreementVersion.updateMany({
      where: { masterServiceAgreementId: msa.id, status: "ENABLED" },
      data: { status: "DISABLED" },
    });
    await tx.masterServiceAgreementVersion.update({
      where: { id: versionId },
      data: { status: "ENABLED" },
    });
  });

  revalidatePath(`/clients/${clientId}`);
}

const CreateRateCardSchema = z.object({
  name: z.string().trim().min(1, { error: "Give this rate card a name." }),
  currency: z.string().trim().min(1, { error: "Currency is required." }),
  effectiveFrom: z.string().trim().min(1, { error: "Effective from date is required." }),
  effectiveTo: z.string().trim().optional(),
});

/** Creates a brand-new named Rate Card document plus its first (current) version. */
export async function createRateCardAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsed = CreateRateCardSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      message:
        errors.name?.[0] ??
        errors.currency?.[0] ??
        errors.effectiveFrom?.[0] ??
        "Invalid rate card details.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Upload the rate card file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractTextFromBuffer(buffer, file.name);
  if ("message" in extracted) {
    return extracted;
  }

  await prisma.rateCard.create({
    data: {
      clientId,
      name: parsed.data.name,
      currency: parsed.data.currency.toUpperCase(),
      versions: {
        create: {
          versionNumber: 1,
          fileName: file.name,
          fileBytes: buffer,
          extractedText: extracted.extractedText,
          effectiveFrom: new Date(parsed.data.effectiveFrom),
          effectiveTo: toDateOrNull(parsed.data.effectiveTo),
          status: "ENABLED",
          uploadedById: session!.user!.id,
        },
      },
    },
  });

  revalidatePath(`/clients/${clientId}`);
}

/** Uploads a new version to an existing named Rate Card, disabling the previous current version. */
export async function uploadRateCardVersionAction(
  clientId: string,
  rateCardId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  // Scoped by both id and clientId — same defense-in-depth convention used
  // throughout this codebase (e.g. toggleChecklistItemAction).
  const rateCard = await prisma.rateCard.findFirst({ where: { id: rateCardId, clientId } });
  if (!rateCard) {
    return { message: "Rate card not found." };
  }

  const parsed = EffectiveDatesSchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo"),
  });
  if (!parsed.success) {
    return {
      message:
        z.flattenError(parsed.error).fieldErrors.effectiveFrom?.[0] ?? "Invalid rate card details.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Upload the rate card file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractTextFromBuffer(buffer, file.name);
  if ("message" in extracted) {
    return extracted;
  }

  await prisma.$transaction(async (tx) => {
    await tx.rateCardVersion.updateMany({
      where: { rateCardId, status: "ENABLED" },
      data: { status: "DISABLED" },
    });

    const latest = await tx.rateCardVersion.findFirst({
      where: { rateCardId },
      orderBy: { versionNumber: "desc" },
    });

    await tx.rateCardVersion.create({
      data: {
        rateCardId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        fileName: file.name,
        fileBytes: buffer,
        extractedText: extracted.extractedText,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        effectiveTo: toDateOrNull(parsed.data.effectiveTo),
        status: "ENABLED",
        uploadedById: session!.user!.id,
      },
    });
  });

  revalidatePath(`/clients/${clientId}`);
}

/** Reverts a Rate Card to a previously-disabled version. */
export async function revertRateCardVersionAction(
  clientId: string,
  rateCardId: string,
  versionId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const rateCard = await prisma.rateCard.findFirst({ where: { id: rateCardId, clientId } });
  const target = rateCard
    ? await prisma.rateCardVersion.findFirst({ where: { id: versionId, rateCardId } })
    : null;
  if (!rateCard || !target) {
    return { message: "Version not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.rateCardVersion.updateMany({
      where: { rateCardId, status: "ENABLED" },
      data: { status: "DISABLED" },
    });
    await tx.rateCardVersion.update({
      where: { id: versionId },
      data: { status: "ENABLED" },
    });
  });

  revalidatePath(`/clients/${clientId}`);
}
