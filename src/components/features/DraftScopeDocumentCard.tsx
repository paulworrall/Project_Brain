"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { DraftScopeDocument } from "@/types/triage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  generateDraftScopeDocumentAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface DraftScopeDocumentMeta {
  versionNumber: number;
  createdAt: Date;
}

// Fixed by DraftScopeDocumentSchema's shape — objectives, deliverables,
// milestones, roles & responsibilities, budget, assumptions & constraints.
const DRAFT_SCOPE_SECTION_COUNT = 6;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Compact summary only — the full document (including the "Gaps Carried
 * Forward" warning) used to render inline here. Full content now lives at
 * the Outputs Library / Version History view, the one canonical place
 * documents render in full.
 */
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
        <Card className="space-y-1 p-4">
          <p className="text-xs text-muted-foreground">
            Version {meta.versionNumber} — {formatDateTime(meta.createdAt)}
          </p>
          <p className="text-sm font-medium text-foreground">
            {DRAFT_SCOPE_SECTION_COUNT} sections ·{" "}
            {draftScopeDocument.flaggedGaps.length === 0
              ? "no gaps flagged"
              : `${draftScopeDocument.flaggedGaps.length} gap${draftScopeDocument.flaggedGaps.length === 1 ? "" : "s"} flagged`}
          </p>
          <Link
            href={`/projects/${projectId}/outputs/DRAFT_SCOPE_DOCUMENT`}
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            View full draft →
          </Link>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Not yet generated.</p>
        </Card>
      )}
    </div>
  );
}
