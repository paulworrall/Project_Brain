"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import {
  uploadRateCardVersionAction,
  revertRateCardVersionAction,
  archiveRateCardAction,
  unarchiveRateCardAction,
  type ActionState,
} from "@/app/(dashboard)/clients/[clientId]/actions";

export interface RateCardVersionView extends VersionHistoryItem {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface RateCardDocumentView {
  id: string;
  name: string;
  currency: string;
  archivedAt: Date | null;
  versions: RateCardVersionView[];
}

/**
 * Archiving retires a whole named Rate Card from end-user selectors — a
 * deliberately separate lever from any version's ENABLED/DISABLED state
 * (Rule 3 audit gap fix). Archived cards stay fully visible here, marked
 * clearly, rather than just disappearing with no trace for an admin.
 */
function ArchiveToggleButton({
  clientId,
  rateCardId,
  isArchived,
}: {
  clientId: string;
  rateCardId: string;
  isArchived: boolean;
}) {
  const action = (isArchived ? unarchiveRateCardAction : archiveRateCardAction).bind(
    null,
    clientId,
    rateCardId
  );
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="shrink-0">
      <Button type="submit" variant="ghost" disabled={pending} className="text-xs">
        {pending ? "Saving…" : isArchived ? "Unarchive" : "Archive"}
      </Button>
      {state?.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
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
        <div key={rateCard.id} className={rateCard.archivedAt ? "opacity-70" : undefined}>
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            {rateCard.archivedAt ? (
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Archived
              </span>
            ) : (
              <span />
            )}
            {canManage && (
              <ArchiveToggleButton
                clientId={clientId}
                rateCardId={rateCard.id}
                isArchived={rateCard.archivedAt !== null}
              />
            )}
          </div>
          <VersionHistory
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
        </div>
      ))}
    </div>
  );
}
