"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { EffectiveDateFields } from "./RateCardsPanel";
import { createRateCardAction, type ActionState } from "@/app/(dashboard)/clients/[clientId]/actions";

/**
 * Shared "Add rate card" quick-create control — collects the rate card's
 * name/currency AND its first version's file in one step (createRateCardAction
 * already requires a file and creates the RateCard + first RateCardVersion
 * atomically; there is no way to reach a zero-version rate card through this
 * form). Used both from the Client detail page (ClientRateCardsSummary) and
 * the Rate Cards library page (RateCardsPanel) — extracted so the two don't
 * hand-roll the same pending-tracking/error-surfacing logic twice.
 */
export function CreateRateCardForm({ clientId }: { clientId: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const action = createRateCardAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  // Close the form only once a submission actually finishes successfully —
  // not merely once it settles (see VersionHistory.tsx for the same fix and
  // the reasoning: `state` alone can't distinguish "never submitted" from
  // "succeeded", since the action returns nothing on success).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.message) {
      setIsAdding(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
        {isAdding ? "Cancel" : "Add rate card"}
      </Button>

      {isAdding && (
        <form action={formAction} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="rcName">Name</Label>
            <Input id="rcName" name="name" type="text" required />
          </div>
          <div>
            <Label htmlFor="rcCurrency">Currency (optional)</Label>
            <Input id="rcCurrency" name="currency" type="text" placeholder="GBP" />
          </div>
          <div>
            <Label htmlFor="rcFile">Rate card file</Label>
            <input
              id="rcFile"
              name="file"
              type="file"
              accept=".docx,.pdf,.pptx,.txt,.xlsx"
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
  );
}
