"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement, CLIENT_ENGAGEMENT_ONLY_MESSAGE } from "@/lib/permissions";
import { extractTextFromBuffer } from "@/lib/extractTextFromBuffer";
import { parseRateCardWorkbook, type ParsedRateCard, type RateCardLine } from "@/services/parsing/rate-card-xlsx";
import { RATE_CARD_ERRORS, distinctCurrencies, formatCurrencySummary } from "@/lib/rateCardTemplate";
import type { Prisma } from "@/generated/prisma/client";

export interface ActionState {
  message?: string;
  /** Row-level validation errors, e.g. "Row 12: 'EURO' isn't a valid currency code, use EUR." */
  errors?: string[];
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
});

type RateCardFileRead =
  | { ok: true; file: File; buffer: Buffer<ArrayBuffer>; parsed: ParsedRateCard }
  | { ok: false; errors: string[] };

/** Reads and validates the uploaded rate card .xlsx — the one parse path shared by preview and save. */
async function readRateCardFile(formData: FormData): Promise<RateCardFileRead> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: [RATE_CARD_ERRORS.noFile] };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseRateCardWorkbook({ name: file.name, size: file.size, type: file.type }, buffer);
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, file, buffer, parsed: result };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function rateLineCreateData(lines: RateCardLine[]): Prisma.RateCardLineItemCreateWithoutRateCardVersionInput[] {
  return lines.map((line) => ({
    role: line.role,
    level: line.grade,
    rateType: line.unit === "Hour" ? "HOURLY" : "DAILY",
    // A decimal string, never a float: the digits are stored exactly as written.
    rate: line.rate,
    currency: line.currency,
    capability: line.capability,
    effectiveFrom: dateOnly(line.effectiveFrom),
    effectiveTo: line.effectiveTo ? dateOnly(line.effectiveTo) : null,
    notes: line.notes,
    sourceRow: line.sourceRow,
  }));
}

function failure(errors: string[]): ActionState {
  return { message: errors[0], errors };
}

export type RateCardPreviewResult =
  | {
      ok: true;
      fileName: string;
      lines: RateCardLine[];
      currencies: string[];
      summary: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }
  | { ok: false; errors: string[] };

/**
 * Step 1 of the rate card upload flow: parses and validates the .xlsx and
 * returns the lines for the admin to review. Saves nothing — the version is
 * only created by createRateCardAction / uploadRateCardVersionAction once the
 * admin confirms (which re-parse the same file, so a preview can't be forged).
 */
export async function previewRateCardUploadAction(formData: FormData): Promise<RateCardPreviewResult> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { ok: false, errors: [CLIENT_ENGAGEMENT_ONLY_MESSAGE] };
  }
  const read = await readRateCardFile(formData);
  if (!read.ok) return read;
  const { parsed, file } = read;
  return {
    ok: true,
    fileName: file.name,
    lines: parsed.lines,
    currencies: distinctCurrencies(parsed.lines),
    summary: formatCurrencySummary(parsed.lines),
    effectiveFrom: parsed.effectiveFrom,
    effectiveTo: parsed.effectiveTo,
  };
}

/** Step 2 (confirm): creates a brand-new named Rate Card plus its first version and rate lines. */
export async function createRateCardAction(
  clientId: string,
  _prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const parsedName = CreateRateCardSchema.safeParse({ name: formData.get("name") });
  if (!parsedName.success) {
    return { message: z.flattenError(parsedName.error).fieldErrors.name?.[0] ?? "Invalid rate card details." };
  }

  const read = await readRateCardFile(formData);
  if (!read.ok) return failure(read.errors);

  await prisma.rateCard.create({
    data: {
      clientId,
      name: parsedName.data.name,
      // Currencies live on the individual rate lines now, never on the card.
      currency: null,
      versions: {
        create: {
          versionNumber: 1,
          fileName: read.file.name,
          fileBytes: read.buffer,
          extractedText: read.parsed.extractedText,
          effectiveFrom: dateOnly(read.parsed.effectiveFrom),
          effectiveTo: read.parsed.effectiveTo ? dateOnly(read.parsed.effectiveTo) : null,
          status: "ENABLED",
          uploadedById: session!.user!.id,
          lineItems: { create: rateLineCreateData(read.parsed.lines) },
        },
      },
    },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/rate-cards");
}

/**
 * Step 2 (confirm): uploads a new version to an existing named Rate Card.
 * Rule 3 (audit gap): unlike MSA/SOW Templates, Rate Card versions must never
 * supersede one another — every version stays independently selectable
 * forever, so this does NOT disable the previous version. See the `status`
 * comment on the create call below for what the field means for this table now.
 */
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

  const read = await readRateCardFile(formData);
  if (!read.ok) return failure(read.errors);

  const latest = await prisma.rateCardVersion.findFirst({
    where: { rateCardId },
    orderBy: { versionNumber: "desc" },
  });

  await prisma.rateCardVersion.create({
    data: {
      rateCardId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      fileName: read.file.name,
      fileBytes: read.buffer,
      extractedText: read.parsed.extractedText,
      effectiveFrom: dateOnly(read.parsed.effectiveFrom),
      effectiveTo: read.parsed.effectiveTo ? dateOnly(read.parsed.effectiveTo) : null,
      // For RateCardVersion specifically, `status` no longer gates
      // selectability (all versions are always selectable — see
      // getRateCardsForWorkstreamAction) and is repurposed as "flagged as
      // the default/most-recent version for display." A freshly uploaded
      // version is intentionally NOT auto-promoted to that flag — it stays
      // DISABLED until an admin explicitly flags it via
      // revertRateCardVersionAction (unchanged below), which still
      // maintains "at most one ENABLED version per Rate Card" (the DB-level
      // partial unique index from the version-pinning migration still
      // enforces this; that's why this insert can't just default to
      // ENABLED — the prior version is no longer disabled here, so a second
      // simultaneous ENABLED row would violate that constraint).
      status: "DISABLED",
      uploadedById: session!.user!.id,
      lineItems: { create: rateLineCreateData(read.parsed.lines) },
    },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/rate-cards");
}

/**
 * Flags a previously-uploaded version as the Rate Card's default/current
 * one for display — the only thing `status` still governs for this table
 * (see uploadRateCardVersionAction). Every version remains selectable
 * regardless of this flag; this does not hide or restore anything.
 */
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

/**
 * Retires a named Rate Card from end-user selectors (getRateCardsForWorkstreamAction,
 * createProjectAction, updateProjectSummaryAction) without touching any of its
 * versions' ENABLED/DISABLED state — a deliberately separate lever from the
 * version-currency mechanism above (Rule 3 audit gap: archiving retires the
 * whole named document; it must not be implemented by reusing the version
 * status field). The RateCard row and all its versions remain in the
 * database and stay visible in admin/library views.
 */
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

  const result = await prisma.rateCard.updateMany({
    where: { id: rateCardId, clientId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { message: "Rate card not found." };
  }

  revalidatePath(`/clients/${clientId}`);
}

/** Reverses archiveRateCardAction — corrects a mistaken archive. */
export async function unarchiveRateCardAction(
  clientId: string,
  rateCardId: string,
  _prevState: ActionState | undefined,
  _formData: FormData
): Promise<ActionState | undefined> {
  const session = await auth();
  if (!isClientEngagement(session)) {
    return { message: CLIENT_ENGAGEMENT_ONLY_MESSAGE };
  }

  const result = await prisma.rateCard.updateMany({
    where: { id: rateCardId, clientId },
    data: { archivedAt: null },
  });
  if (result.count === 0) {
    return { message: "Rate card not found." };
  }

  revalidatePath(`/clients/${clientId}`);
}
