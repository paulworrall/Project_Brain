import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import { StaleOutputNotice } from "./StaleOutputNotice";
import type { ProjectOutputFreshness } from "@/lib/outputFreshness";
import { regeneratePositionDocumentAction } from "@/app/(dashboard)/projects/[projectId]/actions";
import type { Capability } from "@/generated/prisma/enums";
import { PositionDocumentView } from "./PositionDocumentView";
import { ClarificationEmailCard, type ClarificationEmailDraftMeta } from "./ClarificationEmailCard";
import {
  CapabilitiesAndEstimateBriefPanel,
  type EstimateBriefVersionMeta,
} from "./CapabilitiesAndEstimateBriefPanel";
import type { ChecklistItemView } from "./ChecklistView";
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
  checklistItems: ChecklistItemView[];
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  confirmedCapabilities: Capability[];
  estimateBriefVersion: EstimateBriefVersionMeta | null;
  /** Which of Phase 1's outputs no longer reflect the project. */
  outputFreshness?: ProjectOutputFreshness;
  clarificationEmailDraft?: ClarificationEmailDraftMeta | null;
}

export function Phase1Workspace({
  projectId,
  positionDocument,
  clientUpdates,
  clarificationEmail,
  checklistItems,
  briefCompleteness,
  pmPerspective,
  confirmedCapabilities,
  estimateBriefVersion,
  outputFreshness,
  clarificationEmailDraft,
}: Phase1WorkspaceProps) {
  const otherDetailsCount = positionDocument?.whatWeKnow.length ?? 0;
  const outstandingCount = briefCompleteness.requiredOutstanding.length;
  const completeChecklistCount = checklistItems.filter((item) => item.isComplete).length;

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"
        aria-label="Phase 1 progress summary"
      >
        <span>{pluralize(otherDetailsCount, "other detail")} from the brief</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(outstandingCount, "required detail")} to find out</span>
        <span aria-hidden="true">·</span>
        <span>{pluralize(clientUpdates.length, "update")} logged</span>
        <span aria-hidden="true">·</span>
        <span>
          {completeChecklistCount}/{checklistItems.length} checklist items complete
        </span>
      </div>

      <BriefChecklist projectId={projectId} completeness={briefCompleteness} />

      <PmPerspectivePanel projectId={projectId} fields={pmPerspective} />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current position — from the client
        </h3>
        <div className="mb-2 empty:hidden">
          <StaleOutputNotice
            freshness={outputFreshness?.positionDocument}
            regenerateAction={regeneratePositionDocumentAction.bind(null, projectId)}
          />
        </div>
        {positionDocument ? (
          <PositionDocumentView fields={positionDocument} />
        ) : (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        )}
      </div>

      <ClarificationEmailCard
        projectId={projectId}
        email={clarificationEmail}
        freshness={outputFreshness?.clarificationEmail}
        draft={clarificationEmailDraft}
      />

      <CapabilitiesAndEstimateBriefPanel
        projectId={projectId}
        confirmedCapabilities={confirmedCapabilities}
        estimateBriefVersion={estimateBriefVersion}
        estimateBriefFreshness={outputFreshness?.estimateBrief}
      />
    </div>
  );
}
