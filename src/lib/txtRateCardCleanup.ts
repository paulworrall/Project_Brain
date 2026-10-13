import type { PrismaClient } from "@/generated/prisma/client";

// FB-001 one-off cleanup: .txt rate cards are no longer a supported format.
// This module holds the logic so it can be tested; the runnable entry point is
// scripts/cleanup-txt-rate-cards.mts (dry run by default, --apply to delete).

/** Anything with the model delegates this module needs — a PrismaClient or a transaction client. */
export type CleanupDb = Pick<PrismaClient, "rateCardVersion" | "rateCard" | "project" | "client">;

export interface TxtVersionReport {
  versionId: string;
  rateCardId: string;
  clientName: string;
  rateCardName: string;
  fileName: string;
  versionNumber: number;
  isDefault: boolean;
  onlyVersionOnCard: boolean;
  references: { projects: number; estimates: number; estimateVersions: number; referencedLines: number };
  /** Empty when nothing references it, i.e. safe to delete. */
  blockedBy: string[];
  outcome: "WOULD_DELETE" | "DELETED" | "BLOCKED";
}

export interface RateCardRemovalReport {
  rateCardId: string;
  clientName: string;
  rateCardName: string;
  outcome: "WOULD_DELETE" | "DELETED";
}

export interface CleanupReport {
  applied: boolean;
  versions: TxtVersionReport[];
  removedRateCards: RateCardRemovalReport[];
  /** Cards that lose all versions but are still referenced by a Project, so are kept. */
  keptEmptyRateCards: { rateCardId: string; clientName: string; rateCardName: string; reason: string }[];
  /** Clients that would have (or now have) no rate card at all. */
  clientsWithNoRateCard: string[];
}

function describeBlock(refs: TxtVersionReport["references"]): string[] {
  const reasons: string[] = [];
  if (refs.projects > 0) reasons.push(`${refs.projects} project${refs.projects === 1 ? "" : "s"}`);
  if (refs.estimates > 0) reasons.push(`${refs.estimates} estimate${refs.estimates === 1 ? "" : "s"}`);
  if (refs.estimateVersions > 0) {
    reasons.push(`${refs.estimateVersions} estimate version${refs.estimateVersions === 1 ? "" : "s"}`);
  }
  if (refs.referencedLines > 0) {
    reasons.push(`${refs.referencedLines} rate line${refs.referencedLines === 1 ? "" : "s"} used by estimates`);
  }
  return reasons;
}

/**
 * Finds every .txt rate card version and, with apply=true, deletes the ones
 * nothing references. Pass a transaction client when applying so everything
 * happens in one transaction. Never cascades: a version referenced by a
 * Project, Estimate, EstimateVersion or an estimate-used rate line is reported
 * as BLOCKED and left untouched. A RateCard left with no versions is deleted
 * too, unless a Project still references the card itself.
 */
export async function cleanupTxtRateCards(
  db: CleanupDb,
  apply: boolean,
  // Restricts the run to these clients. The script never sets it; tests do, so
  // they can never touch real rows in a shared database.
  options: { clientIds?: string[] } = {}
): Promise<CleanupReport> {
  const txtVersions = await db.rateCardVersion.findMany({
    where: {
      fileName: { endsWith: ".txt", mode: "insensitive" },
      ...(options.clientIds ? { rateCard: { clientId: { in: options.clientIds } } } : {}),
    },
    orderBy: [{ rateCardId: "asc" }, { versionNumber: "asc" }],
    select: {
      id: true,
      rateCardId: true,
      fileName: true,
      versionNumber: true,
      status: true,
      rateCard: {
        select: {
          name: true,
          client: { select: { id: true, name: true } },
          _count: { select: { versions: true, projects: true } },
        },
      },
      _count: { select: { projects: true, estimates: true, estimateVersions: true } },
      lineItems: {
        where: {
          OR: [
            { estimateLineItems: { some: {} } },
            { suggestedFor: { some: {} } },
            { resolvedFor: { some: {} } },
          ],
        },
        select: { id: true },
      },
    },
  });

  const versions: TxtVersionReport[] = txtVersions.map((v) => {
    const references = {
      projects: v._count.projects,
      estimates: v._count.estimates,
      estimateVersions: v._count.estimateVersions,
      referencedLines: v.lineItems.length,
    };
    const blockedBy = describeBlock(references);
    return {
      versionId: v.id,
      rateCardId: v.rateCardId,
      clientName: v.rateCard.client.name,
      rateCardName: v.rateCard.name,
      fileName: v.fileName,
      versionNumber: v.versionNumber,
      isDefault: v.status === "ENABLED",
      onlyVersionOnCard: v.rateCard._count.versions === 1,
      references,
      blockedBy,
      outcome: blockedBy.length > 0 ? "BLOCKED" : apply ? "DELETED" : "WOULD_DELETE",
    };
  });

  const deletable = versions.filter((v) => v.blockedBy.length === 0);

  if (apply && deletable.length > 0) {
    // The version row holds the stored file (fileBytes), so deleting the row
    // removes the file too. Its own rate lines cascade (none are referenced).
    await db.rateCardVersion.deleteMany({ where: { id: { in: deletable.map((v) => v.versionId) } } });
  }

  // A card is emptied when every one of its versions is a deletable .txt one.
  const removedRateCards: RateCardRemovalReport[] = [];
  const keptEmptyRateCards: CleanupReport["keptEmptyRateCards"] = [];
  const byCard = new Map<string, typeof txtVersions>();
  for (const v of txtVersions) byCard.set(v.rateCardId, [...(byCard.get(v.rateCardId) ?? []), v]);

  for (const [rateCardId, cardVersions] of byCard) {
    const card = cardVersions[0].rateCard;
    const deletableHere = cardVersions.filter((v) => deletable.some((d) => d.versionId === v.id));
    if (deletableHere.length !== card._count.versions) continue; // other versions remain
    if (card._count.projects > 0) {
      keptEmptyRateCards.push({
        rateCardId,
        clientName: card.client.name,
        rateCardName: card.name,
        reason: `${card._count.projects} project${card._count.projects === 1 ? "" : "s"} still reference the rate card itself`,
      });
      continue;
    }
    if (apply) await db.rateCard.delete({ where: { id: rateCardId } });
    removedRateCards.push({
      rateCardId,
      clientName: card.client.name,
      rateCardName: card.name,
      outcome: apply ? "DELETED" : "WOULD_DELETE",
    });
  }

  // Clients left with no rate card at all (checked against live counts, so
  // this is correct both before and after the deletes above).
  const affectedClientIds = [...new Set(txtVersions.map((v) => v.rateCard.client.id))];
  const clientsWithNoRateCard: string[] = [];
  for (const clientId of affectedClientIds) {
    const remaining = await db.rateCard.count({ where: { clientId } });
    const stillToBeRemoved = apply ? 0 : removedRateCards.filter((r) => txtVersions.some((v) => v.rateCardId === r.rateCardId && v.rateCard.client.id === clientId)).length;
    if (remaining - stillToBeRemoved === 0) {
      const name = txtVersions.find((v) => v.rateCard.client.id === clientId)!.rateCard.client.name;
      clientsWithNoRateCard.push(name);
    }
  }

  return { applied: apply, versions, removedRateCards, keptEmptyRateCards, clientsWithNoRateCard };
}

/** Plain-text rendering of a report for the script's output. */
export function formatCleanupReport(report: CleanupReport): string {
  const lines: string[] = [];
  lines.push(report.applied ? "MODE: APPLY (changes were made)" : "MODE: DRY RUN (nothing was changed)");
  lines.push(`.txt rate card versions found: ${report.versions.length}`);
  for (const v of report.versions) {
    lines.push(
      `- [${v.outcome}] ${v.clientName} / ${v.rateCardName} / v${v.versionNumber} ${v.fileName}` +
        ` (default: ${v.isDefault ? "yes" : "no"}, only version on card: ${v.onlyVersionOnCard ? "yes" : "no"})`
    );
    if (v.blockedBy.length > 0) lines.push(`    referenced by: ${v.blockedBy.join(", ")}`);
  }
  if (report.removedRateCards.length > 0) {
    lines.push(`Rate cards ${report.applied ? "deleted" : "that would be deleted"} (left with no versions):`);
    for (const r of report.removedRateCards) lines.push(`- ${r.clientName} / ${r.rateCardName}`);
  }
  for (const k of report.keptEmptyRateCards) {
    lines.push(`Kept (no versions left but ${k.reason}): ${k.clientName} / ${k.rateCardName}`);
  }
  if (report.clientsWithNoRateCard.length > 0) {
    lines.push(`Clients ${report.applied ? "now" : "that would be"} left with no rate card: ${report.clientsWithNoRateCard.join(", ")}`);
  }
  return lines.join("\n");
}
