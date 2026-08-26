"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { LibrarySummaryList, type LibrarySummaryItem } from "./LibrarySummaryList";
import {
  createClientSpecificSOWTemplateAction,
  type ActionState,
} from "@/app/(dashboard)/sow-templates/actions";

export interface SowTemplateSummary {
  id: string;
  name: string;
  isBaseline: boolean;
  currentVersionFileName: string | null;
}

/**
 * Read view of the SOW Templates available to this Client (the global
 * baseline plus this Client's own variants) — full upload/revert management
 * lives on the dedicated SOW Templates library page (/sow-templates), not
 * here, to avoid duplicating that logic. Creating a new client-specific
 * variant is the one write action offered directly from this page.
 */
export function ClientSowTemplatesSection({
  clientId,
  clientName,
  baseline,
  variants,
  canManage,
}: {
  clientId: string;
  clientName: string;
  baseline: SowTemplateSummary | null;
  variants: SowTemplateSummary[];
  canManage: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const action = createClientSpecificSOWTemplateAction.bind(null, clientId);
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

  const items: LibrarySummaryItem[] = [
    ...(baseline
      ? [{ id: baseline.id, name: baseline.name, tag: "baseline", fileName: baseline.currentVersionFileName }]
      : []),
    ...variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      fileName: variant.currentVersionFileName,
    })),
  ];

  return (
    <LibrarySummaryList
      title="SOW Templates available to this client"
      manageHref="/sow-templates"
      items={items}
      emptyMessage="No SOW Templates available yet."
    >
      {canManage && (
        <div className="mt-4 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
            {isAdding ? "Cancel" : `Add ${clientName}-specific variant`}
          </Button>

          {isAdding && (
            <form action={formAction} className="mt-3 space-y-3">
              <div>
                <Label htmlFor="variantName">Variant name</Label>
                <Input id="variantName" name="name" type="text" required />
              </div>
              <div>
                <Label htmlFor="variantFile">SOW Template file</Label>
                <input
                  id="variantFile"
                  name="file"
                  type="file"
                  accept=".docx,.pdf,.pptx,.txt"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </div>
              {state?.message && (
                <p className="text-sm text-danger" role="alert">
                  {state.message}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add variant"}
              </Button>
            </form>
          )}
        </div>
      )}
    </LibrarySummaryList>
  );
}
