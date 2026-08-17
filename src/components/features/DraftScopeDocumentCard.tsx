"use client";

import { useActionState } from "react";
import type { DraftScopeDocument } from "@/types/triage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  generateDraftScopeDocumentAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";

export interface DraftScopeDocumentMeta {
  versionNumber: number;
  createdAt: Date;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DraftScopeDocumentCard({
  projectId,
  draftScopeDocument,
  meta,
}: {
  projectId: string;
  draftScopeDocument: DraftScopeDocument | null;
  meta: DraftScopeDocumentMeta | null;
}) {
  const action = generateDraftScopeDocumentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Draft scope document</h3>
        <form action={formAction}>
          <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
            {pending ? "Generating…" : draftScopeDocument ? "Regenerate" : "Generate"}
          </Button>
        </form>
      </div>
      {state?.message && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      {draftScopeDocument && meta ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Version {meta.versionNumber} — {formatDateTime(meta.createdAt)}
          </p>
          <DraftScopeDocumentView scope={draftScopeDocument} />
        </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Not yet generated.</p>
        </Card>
      )}
    </div>
  );
}
