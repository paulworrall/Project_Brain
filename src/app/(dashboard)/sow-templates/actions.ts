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

export interface SOWTemplateOption {
  id: string;
  name: string;
  scope: "GLOBAL" | "CLIENT_SPECIFIC";
  isBaseline: boolean;
}

/**
 * Client-scoped SOW Template lookup — the global baseline (clientId null)
 * plus this Client's own variants, queried WHERE clientId matches or is
 * null. A different Client's variants are never fetched, not just hidden —
 * the same isolation guarantee already used for Rate Cards
 * (getRateCardsForWorkstreamAction).
 */
export async function getSOWTemplatesForClientAction(clientId: string): Promise<SOWTemplateOption[]> {
  if (!clientId) {
    return [];
  }

  return prisma.sOWTemplate.findMany({
    where: { OR: [{ clientId: null }, { clientId }] },
    orderBy: [{ isBaseline: "desc" }, { name: "asc" }],
    select: { id: true, name: true, scope: true, isBaseline: true },
  });
}

/** Uploads a new version to an existing SOW Template (baseline or a client-specific variant). */
export async function uploadSOWTemplateVersionAction(
  sowTemplateId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const template = await prisma.sOWTemplate.findUnique({ where: { id: sowTemplateId } });
  if (!template) {
    return { message: "SOW Template not found." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Upload the SOW Template file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractTextFromBuffer(buffer, file.name);
  if ("message" in extracted) {
    return extracted;
  }

  await prisma.$transaction(async (tx) => {
    await tx.sOWTemplateVersion.updateMany({
      where: { sowTemplateId, status: "ENABLED" },
      data: { status: "DISABLED" },
    });

    const latest = await tx.sOWTemplateVersion.findFirst({
      where: { sowTemplateId },
      orderBy: { versionNumber: "desc" },
    });

    await tx.sOWTemplateVersion.create({
      data: {
        sowTemplateId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        fileName: file.name,
        fileBytes: buffer,
        extractedText: extracted.extractedText,
        status: "ENABLED",
        uploadedById: session!.user!.id,
      },
    });
  });

  revalidatePath("/sow-templates");
  if (template.clientId) {
    revalidatePath(`/clients/${template.clientId}`);
  }
}

/** Reverts a SOW Template to a previously-disabled version. */
export async function revertSOWTemplateVersionAction(
  sowTemplateId: string,
  versionId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const template = await prisma.sOWTemplate.findUnique({ where: { id: sowTemplateId } });
  const target = template
    ? await prisma.sOWTemplateVersion.findFirst({ where: { id: versionId, sowTemplateId } })
    : null;
  if (!template || !target) {
    return { message: "Version not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.sOWTemplateVersion.updateMany({
      where: { sowTemplateId, status: "ENABLED" },
      data: { status: "DISABLED" },
    });
    await tx.sOWTemplateVersion.update({
      where: { id: versionId },
      data: { status: "ENABLED" },
    });
  });

  revalidatePath("/sow-templates");
  if (template.clientId) {
    revalidatePath(`/clients/${template.clientId}`);
  }
}

const CreateVariantSchema = z.object({
  name: z.string().trim().min(1, { error: "Give this SOW Template variant a name." }),
});

/** Creates a new client-specific SOW Template variant plus its first (current) version. */
export async function createClientSpecificSOWTemplateAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsed = CreateVariantSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      message: z.flattenError(parsed.error).fieldErrors.name?.[0] ?? "Invalid variant details.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Upload the SOW Template file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractTextFromBuffer(buffer, file.name);
  if ("message" in extracted) {
    return extracted;
  }

  await prisma.sOWTemplate.create({
    data: {
      name: parsed.data.name,
      scope: "CLIENT_SPECIFIC",
      clientId,
      versions: {
        create: {
          versionNumber: 1,
          fileName: file.name,
          fileBytes: buffer,
          extractedText: extracted.extractedText,
          status: "ENABLED",
          uploadedById: session!.user!.id,
        },
      },
    },
  });

  revalidatePath("/sow-templates");
  revalidatePath(`/clients/${clientId}`);
}
