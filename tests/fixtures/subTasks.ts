import { deriveSubTasks, type SubTask, type SubTaskInput } from "@/lib/project/subTasks";
import type { StepId } from "@/lib/projectSteps";

/** A project that has done everything except the SOW approval (as in the next-action tests). */
export const subTaskInput: SubTaskInput = {
  projectComplete: false,
  hasScopeSummary: true,
  openQuestions: 0,
  scopeConfirmed: true,
  scopeNewerThanConfirmed: false,
  capabilityCount: 2,
  hasEstimateBrief: true,
  specialistReceived: 2,
  specialistTotal: 2,
  hasEstimate: true,
  estimateStale: false,
  estimateApproved: true,
  hasSow: true,
  sowStale: false,
  sowApproved: false,
  scopeVersion: 2,
  requiredCaptured: 4,
  requiredTotal: 4,
  hasSowTemplate: true,
  scopeConfirmedLabel: "Scope confirmed · 3 Nov",
  estimateApprovedLabel: "Approved 18 Oct · 45,675.00 USD",
  sowApprovedLabel: "Approved 22 Oct · v2",
};

export function subTasksFor(step: StepId, overrides: Partial<SubTaskInput> = {}): SubTask[] {
  return deriveSubTasks({ ...subTaskInput, ...overrides }, step);
}

/**
 * For component tests that look inside every card: all sub-tasks open (current),
 * none blocked — so nothing is collapsed or hidden.
 */
export function allOpen(step: StepId, overrides: Partial<SubTaskInput> = {}): SubTask[] {
  return subTasksFor(step, overrides).map((task) => ({ ...task, current: true, blocked: null }));
}
