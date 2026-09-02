"use client";

import { LibrarySummaryList, type LibrarySummaryItem } from "./LibrarySummaryList";
import { CreateRateCardForm } from "./CreateRateCardForm";
import { formatRateCardLabel } from "@/lib/formatRateCardLabel";

export interface RateCardSummaryView {
  id: string;
  name: string;
  // Nullable — see formatRateCardLabel: a rate card can carry several
  // currencies (one per role) within one file, so it's not always set.
  currency: string | null;
  currentVersionFileName: string | null;
}

/**
 * Read view of this Client's Rate Cards, matching the same library-summary
 * pattern as SOW Templates — full upload/revert management for each named
 * Rate Card lives on the dedicated library page (/rate-cards). Creating a
 * brand-new named Rate Card is the one write action offered directly here,
 * mirroring exactly where SOW Template variant creation lives.
 */
export function ClientRateCardsSummary({
  clientId,
  rateCards,
  canManage,
}: {
  clientId: string;
  rateCards: RateCardSummaryView[];
  canManage: boolean;
}) {
  const items: LibrarySummaryItem[] = rateCards.map((rc) => ({
    id: rc.id,
    name: formatRateCardLabel(rc.name, rc.currency),
    tag: "current",
    fileName: rc.currentVersionFileName,
  }));

  return (
    <LibrarySummaryList
      title="Rate Cards"
      manageHref="/rate-cards"
      items={items}
      emptyMessage="No rate cards on file yet."
    >
      {canManage && (
        <div className="mt-4 border-t border-border pt-4">
          <CreateRateCardForm clientId={clientId} />
        </div>
      )}
    </LibrarySummaryList>
  );
}
