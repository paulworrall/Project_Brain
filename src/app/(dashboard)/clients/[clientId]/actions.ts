"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement, CLIENT_ENGAGEMENT_ONLY_MESSAGE } from "@/lib/permissions";
import { parseDocumentToText, UnsupportedBriefFormatError } from "@/services/parsing";

export interface ActionState {
  message?: string;
}

function toDateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ extractedText: string } | { message: string }> {
  try {
    return { extractedText: await parseDocumentToText(buffer, fileName) };
  } catch (error) {
    if (error instanceof UnsupportedBriefFormatError) {
      return { message: error.message };
    }
    return { message: "Couldn't read that file." };
  }
}

const MsaSchema = z.object({
  effectiveFrom: z.string().trim().min(1, { error: "Effective from date is required." }),
  effectiveTo: z.string().trim().optional(),
});

/**
 * Handles both "Add MSA" (first upload) and "Replace MSA" — they're the
 * same action, per the front-end spec: uploading a new one automatically
 * marks the client's current Active MSA as Superseded rather than deleting
 * it, so the prior agreement is still visible in the list.
 */
export async function createMasterServiceAgreementAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsed = MsaSchema.safeParse({
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
    await tx.masterServiceAgreement.updateMany({
      where: { clientId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });

    await tx.masterServiceAgreement.create({
      data: {
        clientId,
        fileName: file.name,
        fileBytes: buffer,
        extractedText: extracted.extractedText,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        effectiveTo: toDateOrNull(parsed.data.effectiveTo),
        status: "ACTIVE",
        uploadedById: session!.user!.id,
      },
    });
  });

  revalidatePath(`/clients/${clientId}`);
}

const RateCardSchema = z.object({
  name: z.string().trim().min(1, { error: "Give this rate card a name." }),
  currency: z.string().trim().min(1, { error: "Currency is required." }),
  effectiveFrom: z.string().trim().min(1, { error: "Effective from date is required." }),
  effectiveTo: z.string().trim().optional(),
});

export async function createRateCardAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsed = RateCardSchema.safeParse({
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
      fileName: file.name,
      fileBytes: buffer,
      extractedText: extracted.extractedText,
      effectiveFrom: new Date(parsed.data.effectiveFrom),
      effectiveTo: toDateOrNull(parsed.data.effectiveTo),
      status: "ACTIVE",
      uploadedById: session!.user!.id,
    },
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function archiveRateCardAction(
  clientId: string,
  rateCardId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  // Scoped by both id and clientId — same defense-in-depth convention as
  // toggleChecklistItemAction, cheap insurance against a stale/tampered id.
  const result = await prisma.rateCard.updateMany({
    where: { id: rateCardId, clientId },
    data: { status: "ARCHIVED" },
  });

  if (result.count === 0) {
    return { message: "Rate card not found." };
  }

  revalidatePath(`/clients/${clientId}`);
}
