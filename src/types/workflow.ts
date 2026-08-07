export type StepStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface WorkflowStep {
  stageNumber: number;
  name: string;
  status: StepStatus;
}

export const STEP_KIND = {
  AGENT: "AGENT",
  HUMAN_INPUT: "HUMAN_INPUT",
} as const;
export type StepKind = (typeof STEP_KIND)[keyof typeof STEP_KIND];

/**
 * Whether a step is an AI agent run or a human data-entry touchpoint —
 * drives which action label/control the step shows once its own task
 * wires it up (Run Agent vs Submit Notes).
 */
export const STEP_KIND_BY_STAGE: Record<number, StepKind> = {
  1: STEP_KIND.AGENT, // Intake
  2: STEP_KIND.AGENT, // Clarification Email drafted
  3: STEP_KIND.HUMAN_INPUT, // Get Clarifications (paste client reply)
  4: STEP_KIND.AGENT, // Triage
  5: STEP_KIND.HUMAN_INPUT, // Review with Specialist Leads (paste feedback)
  6: STEP_KIND.AGENT, // Estimation Kick Off
  7: STEP_KIND.HUMAN_INPUT, // Estimation Session
  8: STEP_KIND.AGENT, // Commercials & SOW
  9: STEP_KIND.AGENT, // Planning & Capability Briefing
  10: STEP_KIND.AGENT, // Commercial Status Monitoring
};
