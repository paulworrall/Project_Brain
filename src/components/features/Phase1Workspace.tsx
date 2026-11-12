import type { ReactNode } from "react";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import type { DraftScopeDocument } from "@/types/triage";
import { PositionDocumentView } from "./PositionDocumentView";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";
import { ClarificationEmailCard, type ClarificationEmailDraftMeta } from "./ClarificationEmailCard";
import { BriefChecklist } from "./BriefChecklist";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { PmPerspectivePanel } from "./PmPerspectivePanel";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScopeSummaryCard, type ScopeSummaryCardData } from "./ScopeSummaryCard";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// A saved project update — counted in the progress summary strip below.
export interface ClientUpdateLogEntry {
  id: string;
  content: string;
  createdAt: Date;
  createdByName: string | null;
}

export interface EarlierDocuments {
  positionDocument: PositionDocumentFields | null;
  draftScopeDocument: DraftScopeDocument | null;
}

/**
 * The Brief step's working content. FB-009: the Scope summary is the one scope
 * document (it replaces the Position Document / Draft Scope); a project set up
 * before it keeps those read-only under "Earlier documents". The clarification
 * email is an action card shown only while there are open questions. The
 * step's readiness list and scope gate are added around it by BriefStep.
 */
export interface Phase1WorkspaceProps {
  projectId: string;
  clientUpdates: ClientUpdateLogEntry[];
  clarificationEmail: ClarificationEmail | null;
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  clarificationEmailDraft?: ClarificationEmailDraftMeta | null;
  scopeSummary?: ScopeSummaryCardData | null;
  earlierDocuments?: EarlierDocuments;
  /** Stored open questions plus required key details still outstanding. */
  openQuestions?: number;
  clarificationSentAt?: string | null;
  /** Brief completeness from the Intake Agent (FB-009 D), shown on the Scope summary card. */
  assessment?: ReactNode;
  /** The project is complete: nothing can be edited. */
  readOnly?: boolean;
}

const NO_EARLIER: EarlierDocuments = { positionDocument: null, draftScopeDocument: null };

export function Phase1Workspace({
  projectId,
  clientUpdates,
  clarificationEmail,
  briefCompleteness,
  pmPerspective,
  clarificationEmailDraft,
  scopeSummary = null,
  earlierDocuments = NO_EARLIER,
  openQuestions = 0,
  clarificationSentAt = null,
  assessment,
  readOnly = false,
}: Phase1WorkspaceProps) {
  const outstandingCount = briefCompleteness.requiredOutstanding.length;
  const hasEarlier =
    earlierDocuments.positionDocument !== null || earlierDocuments.draftScopeDocument !== null;

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"
        aria-label="Brief progress summary"
      >
        <span>{pluralize(openQuestions, "open question")}</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(outstandingCount, "required detail")} to find out</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(clientUpdates.length, "update")} logged</span>
      </div>

      <ScopeSummaryCard
        projectId={projectId}
        summary={scopeSummary}
        readOnly={readOnly}
        assessment={assessment}
        canCreateFromEarlier={hasEarlier}
      />

      {openQuestions > 0 && (
        <ClarificationEmailCard
          projectId={projectId}
          email={clarificationEmail}
          draft={clarificationEmailDraft}
          sentAt={clarificationSentAt}
          openQuestionCount={openQuestions}
          readOnly={readOnly}
        />
      )}

      {/* A disabled fieldset makes every control inside read-only once the project is complete. */}
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <legend className="sr-only">Key details and PM perspective</legend>
        <BriefChecklist projectId={projectId} completeness={briefCompleteness} />
        <PmPerspectivePanel projectId={projectId} fields={pmPerspective} />
      </fieldset>

      {hasEarlier && (
        <Disclosure
          summary={<span className="text-sm font-medium text-foreground">Earlier documents</span>}
        >
          <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              Read-only. These were made before scope summaries; nothing reads them once the scope
              summary exists.
            </p>
            {earlierDocuments.positionDocument && (
              <div>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Position Document
                </h4>
                <PositionDocumentView fields={earlierDocuments.positionDocument} />
              </div>
            )}
            {earlierDocuments.draftScopeDocument && (
              <div>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Draft Scope Document
                </h4>
                <DraftScopeDocumentView scope={earlierDocuments.draftScopeDocument} />
              </div>
            )}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
