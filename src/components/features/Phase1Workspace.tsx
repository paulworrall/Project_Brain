import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { DraftScopeDocument } from "@/types/triage";
import { PositionDocumentView } from "./PositionDocumentView";
import { ClientUpdateComposer, type ClientUpdateLogEntry } from "./ClientUpdateComposer";
import { ClarificationEmailCard } from "./ClarificationEmailCard";
import { DraftScopeDocumentCard, type DraftScopeDocumentMeta } from "./DraftScopeDocumentCard";
import { EditableChecklist } from "./EditableChecklist";
import type { ChecklistItemView } from "./ChecklistView";

/**
 * Phase 1 ("Clarifying the brief and scope") as a single fluid workspace —
 * replaces the old 4-step gated sequence (Intake / Clarification Email Sent
 * / Get Clarifications / Triage). Clarification happens repeatedly, over
 * days or weeks, outside the platform, so this surfaces the Position
 * Document's live state plus a repeatable client-update log instead of a
 * one-shot step you complete once.
 */
export interface Phase1WorkspaceProps {
  projectId: string;
  positionDocument: PositionDocumentFields | null;
  clientUpdates: ClientUpdateLogEntry[];
  clarificationEmail: ClarificationEmail | null;
  draftScopeDocument: DraftScopeDocument | null;
  draftScopeDocumentMeta: DraftScopeDocumentMeta | null;
  checklistItems: ChecklistItemView[];
}

export function Phase1Workspace({
  projectId,
  positionDocument,
  clientUpdates,
  clarificationEmail,
  draftScopeDocument,
  draftScopeDocumentMeta,
  checklistItems,
}: Phase1WorkspaceProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current position
        </h3>
        {positionDocument ? (
          <PositionDocumentView fields={positionDocument} />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>

      <ClientUpdateComposer projectId={projectId} updates={clientUpdates} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ClarificationEmailCard email={clarificationEmail} />
        <DraftScopeDocumentCard
          projectId={projectId}
          draftScopeDocument={draftScopeDocument}
          meta={draftScopeDocumentMeta}
        />
      </div>

      <EditableChecklist projectId={projectId} items={checklistItems} />
    </div>
  );
}
