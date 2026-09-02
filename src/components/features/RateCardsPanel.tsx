"use client";

import { useActionState, type MouseEvent } from "react";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import { CreateRateCardForm } from "./CreateRateCardForm";
import { formatRateCardLabel } from "@/lib/formatRateCardLabel";
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
  // Nullable — a rate card can carry multiple currencies (one per role)
  // within a single file, so recording one at upload time isn't always
  // meaningful. Display sites omit the "(CURRENCY)" suffix entirely when
  // absent, never render a literal "(null)"/"(undefined)".
  currency: string | null;
  archivedAt: Date | null;
  /** How many Projects currently reference this Rate Card (via rateCardId) — gates the archive confirmation below. */
  liveProjectCount: number;
  versions: RateCardVersionView[];
}

/**
 * Archiving retires a whole named Rate Card from end-user selectors — a
 * deliberately separate lever from any version's ENABLED/DISABLED state
 * (Rule 3 audit gap fix). Archived cards stay fully visible here, marked
 * clearly, rather than just disappearing with no trace for an admin.
 *
 * Archiving (not unarchiving) a Rate Card that's still referenced by one or
 * more Projects asks for confirmation first, naming the count — a native
 * `confirm()` rather than a bespoke modal, matching this app's existing
 * preference for plain patterns. Skipped entirely when nothing references
 * the card, so the common case stays a single click.
 */
function ArchiveToggleButton({
  clientId,
  rateCardId,
  isArchived,
  liveProjectCount,
}: {
  clientId: string;
  rateCardId: string;
  isArchived: boolean;
  liveProjectCount: number;
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

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (isArchived || liveProjectCount === 0) {
      return;
    }
    const projectWord = liveProjectCount === 1 ? "project" : "projects";
    const confirmed = window.confirm(
      `This rate card is currently used by ${liveProjectCount} ${projectWord}. Archive it anyway? It will no longer be selectable for new projects, but existing references are unaffected.`
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="shrink-0">
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        className="text-xs"
        onClick={handleClick}
      >
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
 * page (/rate-cards), grouped there by Client. Also renders the "Add rate
 * card" quick-create form directly here (shared with ClientRateCardsSummary
 * via CreateRateCardForm) — regardless of whether this Client currently has
 * any Rate Cards, so creation is never a dead end reachable only from the
 * Client detail page.
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
  return (
    <div className="space-y-3">
      {rateCards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rate cards on file yet.</p>
      ) : (
        rateCards.map((rateCard) => (
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
                  liveProjectCount={rateCard.liveProjectCount}
                />
              )}
            </div>
            <VersionHistory
              title={formatRateCardLabel(rateCard.name, rateCard.currency)}
              versions={rateCard.versions.map((v) => ({
                ...v,
                detail: `${formatDate(v.effectiveFrom)} – ${formatDate(v.effectiveTo)}`,
              }))}
              canManage={canManage}
              fileLabel="Rate card file"
              fileAccept=".docx,.pdf,.pptx,.txt,.xlsx"
              onUpload={uploadRateCardVersionAction.bind(null, clientId, rateCard.id)}
              makeRevertAction={(versionId) =>
                revertRateCardVersionAction.bind(null, clientId, rateCard.id, versionId)
              }
            >
              <EffectiveDateFields />
            </VersionHistory>
          </div>
        ))
      )}
      {canManage && <CreateRateCardForm clientId={clientId} />}
    </div>
  );
}
