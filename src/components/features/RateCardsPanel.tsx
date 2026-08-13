"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  createRateCardAction,
  archiveRateCardAction,
  type ActionState,
} from "@/app/(dashboard)/clients/[clientId]/actions";

export interface RateCardView {
  id: string;
  name: string;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: "ACTIVE" | "ARCHIVED";
}

const STATUS_BADGE_CLASS: Record<RateCardView["status"], string> = {
  ACTIVE: "bg-success-bg text-success",
  ARCHIVED: "bg-surface-muted text-muted-foreground",
};

const STATUS_LABEL: Record<RateCardView["status"], string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

function ArchiveRateCardButton({ clientId, rateCardId }: { clientId: string; rateCardId: string }) {
  const action = archiveRateCardAction.bind(null, clientId, rateCardId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="shrink-0">
      <Button type="submit" variant="ghost" disabled={pending} className="text-xs">
        {pending ? "Archiving…" : "Archive"}
      </Button>
      {state?.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}

/**
 * Adding and archiving Rate Cards is restricted to the ClientEngagement
 * role. `canManage` hides the controls as a UX nicety only — the real
 * enforcement is server-side in createRateCardAction/archiveRateCardAction
 * (checks the session role, rejects the write). Delivery still sees the
 * list read-only, and can still pick a Rate Card when creating/editing a
 * Project — that's a Project field write, not a document write.
 */
export function RateCardsPanel({
  clientId,
  rateCards,
  canManage,
}: {
  clientId: string;
  rateCards: RateCardView[];
  canManage: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const action = createRateCardAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">Rate Cards</h3>
        {canManage && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsAdding((prev) => !prev)}
          >
            {isAdding ? "Cancel" : "Add rate card"}
          </Button>
        )}
      </div>

      {rateCards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No rate cards on file yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rateCards.map((rc) => (
            <li
              key={rc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">
                  {rc.name} <span className="text-muted-foreground">({rc.currency})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(rc.effectiveFrom)} – {formatDate(rc.effectiveTo)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[rc.status]}`}
                >
                  {STATUS_LABEL[rc.status]}
                </span>
                {canManage && rc.status === "ACTIVE" && (
                  <ArchiveRateCardButton clientId={clientId} rateCardId={rc.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && isAdding && (
        <form
          action={async (formData) => {
            await formAction(formData);
            setIsAdding(false);
          }}
          className="mt-4 space-y-3 border-t border-border pt-4"
        >
          <div>
            <Label htmlFor="rcName">Name</Label>
            <Input id="rcName" name="name" type="text" required />
          </div>
          <div>
            <Label htmlFor="rcCurrency">Currency</Label>
            <Input id="rcCurrency" name="currency" type="text" placeholder="GBP" required />
          </div>
          <div>
            <Label htmlFor="rcFile">Rate card file</Label>
            <input
              id="rcFile"
              name="file"
              type="file"
              accept=".docx,.pdf,.pptx,.txt"
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
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
          {state?.message && (
            <p className="text-sm text-danger" role="alert">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add rate card"}
          </Button>
        </form>
      )}
    </Card>
  );
}
