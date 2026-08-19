"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { LibrarySummaryList, type LibrarySummaryItem } from "./LibrarySummaryList";
import { EffectiveDateFields } from "./RateCardsPanel";
import { createRateCardAction, type ActionState } from "@/app/(dashboard)/clients/[clientId]/actions";

export interface RateCardSummaryView {
  id: string;
  name: string;
  currency: string;
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
  const [isAdding, setIsAdding] = useState(false);
  const action = createRateCardAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  const items: LibrarySummaryItem[] = rateCards.map((rc) => ({
    id: rc.id,
    name: `${rc.name} (${rc.currency})`,
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
          <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
            {isAdding ? "Cancel" : "Add rate card"}
          </Button>

          {isAdding && (
            <form
              action={async (formData) => {
                await formAction(formData);
                setIsAdding(false);
              }}
              className="mt-3 space-y-3"
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
          )}
        </div>
      )}
    </LibrarySummaryList>
  );
}
