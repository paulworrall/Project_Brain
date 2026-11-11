import type { ReactNode } from "react";
import type { ClarificationEmail } from "@/types/intake";
import type { Capability } from "@/generated/prisma/enums";
import type { ApprovalPermissions } from "@/types/approvals";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";
import type { SowChangeStatus } from "@/lib/sowChangeView";
import type { SpecialistRow, SystemCheck } from "@/lib/project/readiness";
import {
  getStep,
  PROJECT_COMPLETE_MESSAGE,
  STEP_PREREQUISITE_NOTE,
  type StepId,
} from "@/lib/projectSteps";
import type { RateCardOption } from "@/app/(dashboard)/projects/new/actions";
import { Phase1Workspace, type ClientUpdateLogEntry, type EarlierDocuments } from "./Phase1Workspace";
import type { ScopeSummaryCardData } from "./ScopeSummaryCard";
import type { BriefAssessment } from "@/types/intake";
import { BriefAssessmentCallout, BriefAssessmentLabel } from "./BriefAssessmentNotice";
import type { ClarificationEmailDraftMeta } from "./ClarificationEmailCard";
import {
  CapabilitiesAndEstimateBriefPanel,
  type EstimateBriefVersionMeta,
} from "./CapabilitiesAndEstimateBriefPanel";
import { BriefReadinessIndicator } from "./BriefReadinessIndicator";
import { BriefCompletenessWarning } from "./BriefGateNotice";
import type { ChecklistItemView } from "./ChecklistView";
import { EditableChecklist } from "./EditableChecklist";
import { EstimatesListPanel, type EstimateListItem, type EstimateLock } from "./EstimatesListPanel";
import { ScopeGate } from "./ScopeGate";
import { SpecialistInputTracker } from "./SpecialistInputTracker";
import {
  StartSowDevelopmentPanel,
  type SowLock,
  type SowTemplateSelectOption,
  type SowVersionMeta,
} from "./StartSowDevelopmentPanel";

/**
 * The three steps' content (FB-008): Brief, Estimate, Statement of Work. Each
 * is a StepSection — heading, an optional prerequisite note, the step's
 * "Before you move on" readiness list, then the step's own cards. The project
 * layout renders all three and ProjectShell shows the active one.
 */

/** What every step needs to render its readiness list and lock state. */
export interface StepCommonProps {
  projectId: string;
  checklistItems: ChecklistItemView[];
  systemChecks: SystemCheck[];
  projectComplete: boolean;
}

/** The id of a step's prerequisite note, which its disabled main action is described by. */
export function prerequisiteNoteId(stepId: StepId): string {
  return `${stepId}-prerequisite-note`;
}

export function StepSection({
  stepId,
  prerequisiteNote = null,
  projectComplete,
  readiness,
  children,
}: {
  stepId: StepId;
  /** Quiet inline note shown when the step's prerequisite isn't met. No step is locked. */
  prerequisiteNote?: string | null;
  projectComplete: boolean;
  readiness: ReactNode;
  children: ReactNode;
}) {
  const step = getStep(stepId);
  const headingId = `step-heading-${stepId}`;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} tabIndex={-1} className="text-2xl font-light text-foreground outline-none">
        {step.heading}
      </h2>
      {projectComplete && (
        <p className="border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
          <span aria-hidden="true">✓ </span>
          {PROJECT_COMPLETE_MESSAGE} Downloads are still available.
        </p>
      )}
      {prerequisiteNote && !projectComplete && (
        <p id={prerequisiteNoteId(stepId)} className="text-sm text-muted-foreground">
          {prerequisiteNote}
        </p>
      )}
      {readiness}
      {children}
    </section>
  );
}

function Readiness({ stepId, common }: { stepId: StepId; common: StepCommonProps }) {
  return (
    <EditableChecklist
      projectId={common.projectId}
      step={stepId}
      items={common.checklistItems.filter((item) => (item.step ?? "brief") === stepId)}
      systemChecks={common.systemChecks}
      readOnly={common.projectComplete}
    />
  );
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export interface BriefStepProps extends StepCommonProps {
  scopeSummary: ScopeSummaryCardData | null;
  earlierDocuments: EarlierDocuments;
  /** FB-009 D: the Intake Agent's judgement of the brief (null for older projects). */
  briefAssessment?: BriefAssessment | null;
  openQuestions: number;
  clarificationSentAt: string | null;
  clientUpdates: ClientUpdateLogEntry[];
  clarificationEmail: ClarificationEmail | null;
  clarificationEmailDraft: ClarificationEmailDraftMeta | null;
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  scopeConfirmedAt: string | null;
  scopeConfirmedByName: string | null;
  estimateApproved: boolean;
}

export function BriefStep(props: BriefStepProps) {
  const outstanding = [
    ...props.systemChecks.filter((c) => !c.met).map((c) => c.label),
    ...props.checklistItems
      .filter((i) => (i.step ?? "brief") === "brief" && !i.isComplete)
      .map((i) => i.label),
  ];
  return (
    <StepSection
      stepId="brief"
      projectComplete={props.projectComplete}
      readiness={<Readiness stepId="brief" common={props} />}
    >
      <BriefAssessmentCallout
        projectId={props.projectId}
        assessment={props.briefAssessment ?? null}
        scopeConfirmed={props.scopeConfirmedAt !== null}
        readOnly={props.projectComplete}
      />
      <BriefReadinessIndicator completeness={props.briefCompleteness} />
      <BriefCompletenessWarning completeness={props.briefCompleteness} />
      <Phase1Workspace
        projectId={props.projectId}
        scopeSummary={props.scopeSummary}
        assessment={<BriefAssessmentLabel assessment={props.briefAssessment ?? null} />}
        earlierDocuments={props.earlierDocuments}
        openQuestions={props.openQuestions}
        clarificationSentAt={props.clarificationSentAt}
        clientUpdates={props.clientUpdates}
        clarificationEmail={props.clarificationEmail}
        clarificationEmailDraft={props.clarificationEmailDraft}
        briefCompleteness={props.briefCompleteness}
        pmPerspective={props.pmPerspective}
        readOnly={props.projectComplete}
      />
      <ScopeGate
        projectId={props.projectId}
        scopeConfirmedAt={props.scopeConfirmedAt}
        scopeConfirmedByName={props.scopeConfirmedByName}
        outstanding={outstanding}
        estimateApproved={props.estimateApproved}
        projectComplete={props.projectComplete}
      />
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export interface EstimateStepProps extends StepCommonProps {
  scopeConfirmed: boolean;
  confirmedCapabilities: Capability[];
  estimateBriefVersion: EstimateBriefVersionMeta | null;
  specialistRows: SpecialistRow[];
  estimates: EstimateListItem[];
  rateCardOptions: RateCardOption[];
  estimateLock: EstimateLock | null;
  approvalPermissions: ApprovalPermissions;
}

export function EstimateStep(props: EstimateStepProps) {
  const prerequisiteNote = props.scopeConfirmed ? null : STEP_PREREQUISITE_NOTE.estimate;
  return (
    <StepSection
      stepId="estimate"
      prerequisiteNote={prerequisiteNote}
      projectComplete={props.projectComplete}
      readiness={<Readiness stepId="estimate" common={props} />}
    >
      <fieldset id="capabilities" disabled={props.projectComplete} className="min-w-0 scroll-mt-6">
        <legend className="sr-only">Capabilities and estimate brief</legend>
        <CapabilitiesAndEstimateBriefPanel
          projectId={props.projectId}
          confirmedCapabilities={props.confirmedCapabilities}
          estimateBriefVersion={props.estimateBriefVersion}
        />
      </fieldset>
      <SpecialistInputTracker
        projectId={props.projectId}
        rows={props.specialistRows}
        readOnly={props.projectComplete}
      />
      <section
        aria-labelledby="build-estimate-heading"
        className="space-y-3 border border-border bg-surface px-4 py-3"
      >
        <h3 id="build-estimate-heading" className="text-base font-medium text-foreground">
          Build The Estimate
        </h3>
        <EstimatesListPanel
          projectId={props.projectId}
          estimates={props.estimates}
          rateCardOptions={props.rateCardOptions}
          lock={props.estimateLock}
          permissions={props.approvalPermissions}
          prerequisiteNoteId={
            prerequisiteNote && !props.projectComplete ? prerequisiteNoteId("estimate") : null
          }
        />
      </section>
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Statement of Work
// ---------------------------------------------------------------------------

export interface SowStepProps extends StepCommonProps {
  estimateApproved: boolean;
  sowChange?: SowChangeStatus;
  currentSowTemplate: { id: string; name: string } | null;
  currentSowTemplateVersion: { id: string } | null;
  sowTemplateOptions: SowTemplateSelectOption[];
  sowVersions: SowVersionMeta[];
  briefCompleteness: BriefCompleteness;
  sowLock: SowLock | null;
  approvalPermissions: ApprovalPermissions;
}

export function SowStep(props: SowStepProps) {
  const prerequisiteNote = props.estimateApproved ? null : STEP_PREREQUISITE_NOTE.sow;
  return (
    <StepSection
      stepId="sow"
      prerequisiteNote={prerequisiteNote}
      projectComplete={props.projectComplete}
      readiness={<Readiness stepId="sow" common={props} />}
    >
      <div className="border border-border bg-surface px-4 py-3">
        <StartSowDevelopmentPanel
          projectId={props.projectId}
          sowChange={props.sowChange}
          currentTemplate={props.currentSowTemplate}
          currentTemplateVersion={props.currentSowTemplateVersion}
          templateOptions={props.sowTemplateOptions}
          sowVersions={props.sowVersions}
          briefCompleteness={props.briefCompleteness}
          lock={props.sowLock}
          permissions={props.approvalPermissions}
          prerequisiteNoteId={
            prerequisiteNote && !props.projectComplete ? prerequisiteNoteId("sow") : null
          }
        />
      </div>
    </StepSection>
  );
}
