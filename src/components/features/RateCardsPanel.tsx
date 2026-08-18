"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import {
  createRateCardAction,
  uploadRateCardVersionAction,
  revertRateCardVersionAction,
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
  versions: RateCardVersionView[];
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

function EffectiveDateFields() {
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

function CreateRateCardForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const action = createRateCardAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        onDone();
      }}
      className="space-y-3"
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
      <EffectiveDateFields />
      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add rate card"}
      </Button>
    </form>
  );
}

/**
 * Adding a new named Rate Card, uploading a new version to an existing one,
 * and reverting are all restricted to the ClientEngagement role, enforced
 * server-side (see clients/[clientId]/actions.ts) — `canManage` only hides
 * the controls as a UX nicety. Delivery still sees every Rate Card's
 * version history read-only, and can still pick a Rate Card's current
 * version when creating/editing a Project — that's a Project field write,
 * not a document write.
 *
 * Each named Rate Card gets its own VersionHistory (the shared component —
 * see src/components/features/VersionHistory.tsx), not one card per
 * top-level panel, since a Client can have several concurrently.
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
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">Rate Cards</h3>
        {canManage && (
          <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
            {isAdding ? "Cancel" : "Add rate card"}
          </Button>
        )}
      </div>

      {rateCards.length === 0 && !isAdding && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">No rate cards on file yet.</p>
        </Card>
      )}

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

      {canManage && isAdding && (
        <Card className="p-5">
          <CreateRateCardForm clientId={clientId} onDone={() => setIsAdding(false)} />
        </Card>
      )}
    </div>
  );
}
