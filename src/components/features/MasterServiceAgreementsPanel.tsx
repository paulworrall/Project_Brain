"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  createMasterServiceAgreementAction,
  type ActionState,
} from "@/app/(dashboard)/clients/[clientId]/actions";

export interface MasterServiceAgreementView {
  id: string;
  fileName: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: "ACTIVE" | "SUPERSEDED";
}

const STATUS_BADGE_CLASS: Record<MasterServiceAgreementView["status"], string> = {
  ACTIVE: "bg-success-bg text-success",
  SUPERSEDED: "bg-surface-muted text-muted-foreground",
};

const STATUS_LABEL: Record<MasterServiceAgreementView["status"], string> = {
  ACTIVE: "Active",
  SUPERSEDED: "Superseded",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

/**
 * Uploading, replacing (auto-supersedes the current Active MSA), and
 * archiving Client-level commercial documents is restricted to the
 * ClientEngagement role. `canManage` hides the form as a UX nicety only —
 * the real enforcement is server-side in createMasterServiceAgreementAction
 * itself (checks the session role, rejects the write). Delivery still sees
 * the list, read-only.
 */
export function MasterServiceAgreementsPanel({
  clientId,
  agreements,
  canManage,
}: {
  clientId: string;
  agreements: MasterServiceAgreementView[];
  canManage: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const action = createMasterServiceAgreementAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const hasActive = agreements.some((a) => a.status === "ACTIVE");

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">Master Service Agreements</h3>
        {canManage && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsAdding((prev) => !prev)}
          >
            {isAdding ? "Cancel" : hasActive ? "Replace MSA" : "Add MSA"}
          </Button>
        )}
      </div>

      {agreements.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No MSAs on file yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {agreements.map((msa) => (
            <li
              key={msa.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{msa.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(msa.effectiveFrom)} – {formatDate(msa.effectiveTo)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[msa.status]}`}
              >
                {STATUS_LABEL[msa.status]}
              </span>
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
            <Label htmlFor="msaFile">MSA file</Label>
            <input
              id="msaFile"
              name="file"
              type="file"
              accept=".docx,.pdf,.pptx,.txt"
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="msaEffectiveFrom">Effective from</Label>
              <input
                id="msaEffectiveFrom"
                name="effectiveFrom"
                type="date"
                required
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="msaEffectiveTo">Effective to (optional)</Label>
              <input
                id="msaEffectiveTo"
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
            {pending ? "Uploading…" : hasActive ? "Replace MSA" : "Upload MSA"}
          </Button>
        </form>
      )}
    </Card>
  );
}
