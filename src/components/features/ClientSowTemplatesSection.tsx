"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">SOW Templates available to this client</h3>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/sow-templates" className="text-xs font-medium text-primary hover:underline">
            Manage in library →
          </Link>
          {canManage && (
            <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
              {isAdding ? "Cancel" : `Add ${clientName}-specific variant`}
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {baseline && (
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <p className="font-medium text-foreground">
              {baseline.name} <span className="text-xs text-muted-foreground">(baseline)</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {baseline.currentVersionFileName ?? "Not yet uploaded"}
            </span>
          </li>
        )}
        {variants.map((variant) => (
          <li
            key={variant.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <p className="font-medium text-foreground">{variant.name}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {variant.currentVersionFileName ?? "Not yet uploaded"}
            </span>
          </li>
        ))}
        {!baseline && variants.length === 0 && (
          <li className="text-sm text-muted-foreground">No SOW Templates available yet.</li>
        )}
      </ul>

      {canManage && isAdding && (
        <form
          action={async (formData) => {
            await formAction(formData);
            setIsAdding(false);
          }}
          className="mt-4 space-y-3 border-t border-border pt-4"
        >
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
    </Card>
  );
}
