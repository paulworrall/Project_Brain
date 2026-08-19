"use client";

import { Label } from "@/components/ui/Label";
import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import { uploadRateCardVersionAction, revertRateCardVersionAction } from "@/app/(dashboard)/clients/[clientId]/actions";

export interface RateCardVersionView extends VersionHistoryItem {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface RateCardDocumentView {
  id: string;
  name: string;
  currency: string;
  versions: RateCardVersionView[];
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

/** Exported so ClientRateCardsSummary's "Add rate card" quick-create form can reuse the same fields. */
export function EffectiveDateFields() {
  return (
    <div className="flex flex-wrap gap-3">
      <div>
        <Label htmlFor="rcEffectiveFrom">Effective from</Label>
        <input
          id="rcEffectiveFrom"
          name="effectiveFrom"
          type="date"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div>
        <Label htmlFor="rcEffectiveTo">Effective to (optional)</Label>
        <input
          id="rcEffectiveTo"
          name="effectiveTo"
          type="date"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
      </div>
    </div>
  );
}

/**
 * Full version-history management (upload new version, revert) for every
 * named Rate Card belonging to one Client — used on the Rate Cards library
 * page (/rate-cards), grouped there by Client. Creating a brand-new named
 * Rate Card is a separate quick-add action that lives on the Client detail
 * page instead (ClientRateCardsSummary), mirroring exactly where SOW
 * Template variant creation lives — not here, to keep this component
 * focused on managing documents that already exist.
 */
export function RateCardsPanel({
  clientId,
  rateCards,
  canManage,
}: {
  clientId: string;
  rateCards: RateCardDocumentView[];
  canManage: boolean;
}) {
  if (rateCards.length === 0) {
    return <p className="text-sm text-muted-foreground">No rate cards on file yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rateCards.map((rateCard) => (
        <VersionHistory
          key={rateCard.id}
          title={`${rateCard.name} (${rateCard.currency})`}
          versions={rateCard.versions.map((v) => ({
            ...v,
            detail: `${formatDate(v.effectiveFrom)} – ${formatDate(v.effectiveTo)}`,
          }))}
          canManage={canManage}
          fileLabel="Rate card file"
          onUpload={uploadRateCardVersionAction.bind(null, clientId, rateCard.id)}
          makeRevertAction={(versionId) =>
            revertRateCardVersionAction.bind(null, clientId, rateCard.id, versionId)
          }
        >
          <EffectiveDateFields />
        </VersionHistory>
      ))}
    </div>
  );
}
