import type { ReactNode } from "react";
import type { Capability } from "@/generated/prisma/enums";
import type { ApprovalPermissions } from "@/types/approvals";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";
import type { SowChangeStatus } from "@/lib/sowChangeView";
import type { SpecialistRow } from "@/lib/project/readiness";
import {
  getStep,
  PROJECT_COMPLETE_MESSAGE,
  STEP_PREREQUISITE_NOTE,
  type StepId,
} from "@/lib/projectSteps";
import type { RateCardOption } from "@/app/(dashboard)/projects/new/actions";
import { Phase1Workspace, type EarlierDocuments } from "./Phase1Workspace";
import type { ScopeSummaryCardData } from "./ScopeSummaryCard";
import type { BriefAssessment } from "@/types/intake";
import { BriefAssessmentCallout, BriefAssessmentLabel } from "./BriefAssessmentNotice";
import {
  CapabilitiesAndEstimateBriefPanel,
  type EstimateBriefVersionMeta,
} from "./CapabilitiesAndEstimateBriefPanel";
import { BriefCompletenessWarning } from "./BriefGateNotice";
import { EstimatesListPanel, type EstimateListItem, type EstimateLock } from "./EstimatesListPanel";
import { ScopeGate } from "./ScopeGate";
import { OpenSubTaskButton, SubTaskCard, SubTaskGroup } from "./SubTaskCard";
import type { SubTask } from "@/lib/project/subTasks";
import { SpecialistInputTracker } from "./SpecialistInputTracker";
import {
  StartSowDevelopmentPanel,
  type SowLock,
  type SowTemplateSelectOption,
  type SowVersionMeta,
} from "./StartSowDevelopmentPanel";

/**
 * The three steps' content (FB-008): Brief, Estimate, Statement of Work. Each
 * is a StepSection — heading, an optional prerequisite note, then the step's
 * own cards. (FB-011: the per-step "Before you move on" readiness lists were
 * removed.) The project layout renders all three and ProjectShell shows the
 * active one.
 */

/** What every step needs to render its lock state. */
export interface StepCommonProps {
  projectId: string;
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
  children,
}: {
  stepId: StepId;
  /** Quiet inline note shown when the step's prerequisite isn't met. No step is locked. */
  prerequisiteNote?: string | null;
  projectComplete: boolean;
  children: ReactNode;
}) {
  const step = getStep(stepId);
  const headingId = `step-heading-${stepId}`;
  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <h2 id={headingId} tabIndex={-1} className="text-section font-bold text-foreground outline-none">
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
      {children}
    </section>
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
  /** FB-011: the project has no MSA and rate card yet (warned about when confirming scope). */
  missingMsaRateCard: boolean;
  clientName: string;
  /** FB-012: Scope summary, Key details, Confirm scope. */
  subTasks: SubTask[];
  briefCompleteness: BriefCompleteness;
  pmPerspective: PmPerspectiveFieldView[];
  scopeConfirmedAt: string | null;
  scopeConfirmedByName: string | null;
  estimateApproved: boolean;
}

export function BriefStep(props: BriefStepProps) {
  return (
    <StepSection stepId="brief" projectComplete={props.projectComplete}>
      <BriefAssessmentCallout
        projectId={props.projectId}
        assessment={props.briefAssessment ?? null}
        scopeConfirmed={props.scopeConfirmedAt !== null}
        readOnly={props.projectComplete}
      />
      <BriefCompletenessWarning completeness={props.briefCompleteness} />
      <Phase1Workspace
        projectId={props.projectId}
        scopeSummary={props.scopeSummary}
        assessment={<BriefAssessmentLabel assessment={props.briefAssessment ?? null} />}
        earlierDocuments={props.earlierDocuments}
        briefCompleteness={props.briefCompleteness}
        pmPerspective={props.pmPerspective}
        readOnly={props.projectComplete}
        subTasks={props.subTasks}
        gate={
          <ScopeGate
            projectId={props.projectId}
            scopeConfirmedAt={props.scopeConfirmedAt}
            scopeConfirmedByName={props.scopeConfirmedByName}
            openQuestions={props.openQuestions}
            missingMsaRateCard={props.missingMsaRateCard}
            clientName={props.clientName}
            estimateApproved={props.estimateApproved}
            projectComplete={props.projectComplete}
          />
        }
      />
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export interface EstimateStepProps extends StepCommonProps {
  /** FB-012: Choose teams, Estimate brief, Specialist inputs, Build the estimate, Client approval. */
  subTasks: SubTask[];
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
    >
      <SubTaskGroup>
        <div className="space-y-4">
          <CapabilitiesAndEstimateBriefPanel
            projectId={props.projectId}
            confirmedCapabilities={props.confirmedCapabilities}
            estimateBriefVersion={props.estimateBriefVersion}
            subTasks={{ teams: props.subTasks[0], brief: props.subTasks[1] }}
            readOnly={props.projectComplete}
          />
          <SpecialistInputTracker
            projectId={props.projectId}
            rows={props.specialistRows}
            readOnly={props.projectComplete}
            task={props.subTasks[2]}
          />
          <SubTaskCard task={props.subTasks[3]} readOnly={props.projectComplete}>
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
          </SubTaskCard>
          <SubTaskCard task={props.subTasks[4]} readOnly={props.projectComplete}>
            <p className="text-sm text-foreground">
              The client&apos;s approval is recorded on an estimate version.
            </p>
            <OpenSubTaskButton targetId={props.subTasks[3].id}>Open the estimates</OpenSubTaskButton>
          </SubTaskCard>
        </div>
      </SubTaskGroup>
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Statement of Work
// ---------------------------------------------------------------------------

export interface SowStepProps extends StepCommonProps {
  /** FB-012: Choose template, Generate SOW, Client approval. */
  subTasks: SubTask[];
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
    >
      <SubTaskGroup>
        <StartSowDevelopmentPanel
          subTasks={{
            template: props.subTasks[0],
            generate: props.subTasks[1],
            approval: props.subTasks[2],
          }}
          readOnly={props.projectComplete}
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
      </SubTaskGroup>
    </StepSection>
  );
}
