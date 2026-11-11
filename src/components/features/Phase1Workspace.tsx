import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import { PositionDocumentView } from "./PositionDocumentView";
import { ClarificationEmailCard, type ClarificationEmailDraftMeta } from "./ClarificationEmailCard";
import { BriefChecklist } from "./BriefChecklist";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { PmPerspectivePanel } from "./PmPerspectivePanel";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// A submission through the "Additional Inputs" panel that also updated the
// Position Document (see uploadKnowledgeItemAction) — counted in the
// progress summary strip below. There's no dedicated UI list of these
// anymore; the Additional Inputs panel's own knowledge-item list doubles as
// the visible history.
export interface ClientUpdateLogEntry {
  id: string;
  content: string;
  createdAt: Date;
  createdByName: string | null;
}

/**
 * The Brief step's working content (FB-008; formerly Phase 1, "Clarifying the
 * brief and scope") as a single fluid workspace. Clarification happens
 * repeatedly, over days or weeks, outside the platform, so this surfaces the
 * key details, the PM's perspective, the Position Document's live state and
 * the client email draft. The step's readiness list and scope gate are added
 * around it by BriefStep. Capabilities & Estimate Brief moved to the Estimate
 * step in FB-008.
 */
export interface Phase1WorkspaceProps {
  projectId: string;
  positionDocument: PositionDocumentFields | null;
  clientUpdates: ClientUpdateLogEntry[];
  clarificationEmail: ClarificationEmail | null;
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  clarificationEmailDraft?: ClarificationEmailDraftMeta | null;
  /** The project is complete: key details and PM perspective can't be edited. */
  readOnly?: boolean;
}

export function Phase1Workspace({
  projectId,
  positionDocument,
  clientUpdates,
  clarificationEmail,
  briefCompleteness,
  pmPerspective,
  clarificationEmailDraft,
  readOnly = false,
}: Phase1WorkspaceProps) {
  const otherDetailsCount = positionDocument?.whatWeKnow.length ?? 0;
  const outstandingCount = briefCompleteness.requiredOutstanding.length;

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"
        aria-label="Brief progress summary"
      >
        <span>{pluralize(otherDetailsCount, "other detail")} from the brief</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(outstandingCount, "required detail")} to find out</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(clientUpdates.length, "update")} logged</span>
      </div>

      {/* A disabled fieldset makes every control inside read-only once the project is complete. */}
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <legend className="sr-only">Key details and PM perspective</legend>
        <BriefChecklist projectId={projectId} completeness={briefCompleteness} />
        <PmPerspectivePanel projectId={projectId} fields={pmPerspective} />
      </fieldset>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current position — from the client
        </h3>
        {positionDocument ? (
          <PositionDocumentView fields={positionDocument} />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>

      <ClarificationEmailCard
        projectId={projectId}
        email={clarificationEmail}
        draft={clarificationEmailDraft}
      />
    </div>
  );
}
