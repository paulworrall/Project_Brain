import type { ReactNode } from "react";
import type { PositionDocumentFields } from "@/types/intake";
import type { DraftScopeDocument } from "@/types/triage";
import { PositionDocumentView } from "./PositionDocumentView";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";
import { BriefChecklist } from "./BriefChecklist";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { PmPerspectivePanel } from "./PmPerspectivePanel";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScopeSummaryCard, type ScopeSummaryCardData } from "./ScopeSummaryCard";
import { SubTaskGroup, SubTaskSection } from "./SubTaskCard";
import type { SubTask } from "@/lib/project/subTasks";

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
 * before it keeps those read-only under "Earlier documents". Open questions
 * live in the scope summary (with a "Copy questions" button, FB-011). The
 * step's scope gate is added around it by BriefStep.
 */
export interface Phase1WorkspaceProps {
  projectId: string;
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  scopeSummary?: ScopeSummaryCardData | null;
  earlierDocuments?: EarlierDocuments;
  /** Brief completeness from the Intake Agent (FB-009 D), shown on the Scope summary card. */
  assessment?: ReactNode;
  /** The project is complete: nothing can be edited. */
  readOnly?: boolean;
  /** FB-012: the Brief step's sub-tasks (Scope summary, Key details, Confirm scope), derived. */
  subTasks?: SubTask[];
  /** The scope gate, rendered inside the third sub-task. */
  gate?: ReactNode;
}

const NO_EARLIER: EarlierDocuments = { positionDocument: null, draftScopeDocument: null };

export function Phase1Workspace({
  projectId,
  briefCompleteness,
  pmPerspective,
  scopeSummary = null,
  earlierDocuments = NO_EARLIER,
  assessment,
  readOnly = false,
  subTasks,
  gate,
}: Phase1WorkspaceProps) {
  const hasEarlier =
    earlierDocuments.positionDocument !== null || earlierDocuments.draftScopeDocument !== null;
  const embedded = subTasks !== undefined;

  return (
    <SubTaskGroup>
      <div className="space-y-4">
        <SubTaskSection task={subTasks?.[0]} readOnly={readOnly} className="space-y-4">
          <ScopeSummaryCard
            projectId={projectId}
            summary={scopeSummary}
            readOnly={readOnly}
            assessment={assessment}
            canCreateFromEarlier={hasEarlier}
            embedded={embedded}
          />
          {hasEarlier && (
            <Disclosure summary={<span className="text-sm font-medium text-foreground">Earlier documents</span>}>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Read-only. These were made before scope summaries; nothing reads them once the
                  scope summary exists.
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
        </SubTaskSection>

        <SubTaskSection task={subTasks?.[1]} readOnly={readOnly} className="space-y-6">
          {/* A disabled fieldset makes every control inside read-only once the project is complete. */}
          <fieldset disabled={readOnly} className="min-w-0 space-y-6">
            <legend className="sr-only">Key details and PM perspective</legend>
            <BriefChecklist projectId={projectId} completeness={briefCompleteness} />
            <PmPerspectivePanel projectId={projectId} fields={pmPerspective} />
          </fieldset>
        </SubTaskSection>

        {gate !== undefined && (
          <SubTaskSection task={subTasks?.[2]} readOnly={readOnly}>
            {gate}
          </SubTaskSection>
        )}
      </div>
    </SubTaskGroup>
  );
}
