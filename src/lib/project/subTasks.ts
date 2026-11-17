/**
 * FB-012: each step's content is an ordered list of numbered sub-tasks. Their
 * status is derived here — one pure function, built only from state the page
 * already derives (the same inputs as deriveNextAction) — and shared by the
 * server and the UI. Nothing is stored. The Next step banner stays the source
 * of truth for "what to do now"; the current sub-task (the first one not done
 * and not blocked) is only where the step's content opens, and agrees with the
 * banner wherever they overlap (see tests).
 */
import type { NextActionInput } from "@/lib/nextAction";
import type { StepId } from "@/lib/projectSteps";

export type SubTaskStatus = "not_started" | "in_progress" | "done" | "needs_review" | "locked";

export interface SubTask {
  /** "brief.scope-summary", "estimate.teams"… */
  id: string;
  step: StepId;
  /** 1-based position within the step. */
  number: number;
  title: string;
  status: SubTaskStatus;
  /** One line shown when done (and for in-progress counts), e.g. "3 of 4 captured". */
  summary: string | null;
  /** Why the task can't be opened yet; null when it can. */
  blocked: string | null;
  /** The first task not done and not blocked: it opens expanded. Never set on a complete project. */
  current: boolean;
}

/** What the sub-task rules may look at: the next-action inputs plus a few display facts. */
export interface SubTaskInput
  extends Pick<
    NextActionInput,
    | "projectComplete"
    | "hasScopeSummary"
    | "openQuestions"
    | "scopeConfirmed"
    | "scopeNewerThanConfirmed"
    | "capabilityCount"
    | "hasEstimateBrief"
    | "specialistReceived"
    | "specialistTotal"
    | "hasEstimate"
    | "estimateStale"
    | "estimateApproved"
    | "hasSow"
    | "sowStale"
    | "sowApproved"
  > {
  /** The latest Scope summary version number, if there is one. */
  scopeVersion: number | null;
  /** Required key details captured, and how many are required. */
  requiredCaptured: number;
  requiredTotal: number;
  /** A SOW template is chosen for the project. */
  hasSowTemplate: boolean;
  /** "Confirmed 3 Nov", "Approved 18 Oct · 45,675.00 USD", "Approved 22 Oct · v2" (the stepper's done summaries). */
  scopeConfirmedLabel: string | null;
  estimateApprovedLabel: string | null;
  sowApprovedLabel: string | null;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

type Draft = Omit<SubTask, "step" | "number" | "current">;

function brief(p: SubTaskInput): Draft[] {
  return [
    {
      id: "brief.scope-summary",
      title: "Scope summary",
      status: p.hasScopeSummary ? "done" : "not_started",
      summary: p.hasScopeSummary
        ? `v${p.scopeVersion ?? 1}${p.openQuestions > 0 ? ` · ${plural(p.openQuestions, "open question")}` : ""}`
        : null,
      blocked: null,
    },
    {
      id: "brief.key-details",
      title: "Key details",
      status:
        p.requiredTotal > 0 && p.requiredCaptured >= p.requiredTotal
          ? "done"
          : p.requiredCaptured > 0
            ? "in_progress"
            : "not_started",
      summary: `${p.requiredCaptured} of ${p.requiredTotal} captured`,
      blocked: null,
    },
    {
      id: "brief.confirm-scope",
      title: "Confirm scope",
      status: p.scopeConfirmed ? (p.scopeNewerThanConfirmed ? "needs_review" : "done") : "not_started",
      summary: p.scopeConfirmed
        ? p.scopeNewerThanConfirmed
          ? "The scope summary has changed since it was confirmed"
          : p.scopeConfirmedLabel
        : p.openQuestions > 0
          ? plural(p.openQuestions, "open question")
          : null,
      blocked: null,
    },
  ];
}

function estimate(p: SubTaskInput): Draft[] {
  const allReceived = p.specialistTotal > 0 && p.specialistReceived >= p.specialistTotal;
  return [
    {
      id: "estimate.teams",
      title: "Choose teams",
      status: p.capabilityCount > 0 ? "done" : "not_started",
      summary: p.capabilityCount > 0 ? plural(p.capabilityCount, "team") : null,
      blocked: null,
    },
    {
      id: "estimate.brief",
      title: "Estimate brief",
      status: p.hasEstimateBrief ? "done" : "not_started",
      summary: p.hasEstimateBrief ? "Prepared" : null,
      blocked: p.capabilityCount === 0 ? "Choose teams first" : null,
    },
    {
      id: "estimate.specialists",
      title: "Specialist inputs",
      status: allReceived ? "done" : p.specialistReceived > 0 ? "in_progress" : "not_started",
      summary: p.specialistTotal > 0 ? `${p.specialistReceived} of ${p.specialistTotal} received` : null,
      blocked: p.specialistTotal === 0 ? "Choose teams first" : null,
    },
    {
      id: "estimate.build",
      title: "Build the estimate",
      status: p.hasEstimate ? (p.estimateStale && !p.estimateApproved ? "needs_review" : "done") : "not_started",
      summary: p.hasEstimate
        ? p.estimateStale && !p.estimateApproved
          ? "The scope changed after this estimate was saved"
          : "Saved"
        : null,
      blocked: null,
    },
    {
      id: "estimate.approval",
      title: "Client approval",
      status: p.estimateApproved ? "done" : "not_started",
      summary: p.estimateApproved ? p.estimateApprovedLabel : null,
      blocked: !p.hasEstimate && !p.estimateApproved ? "Needs an estimate" : null,
    },
  ];
}

function sow(p: SubTaskInput): Draft[] {
  return [
    {
      id: "sow.template",
      title: "Choose template",
      status: p.hasSowTemplate ? "done" : "not_started",
      summary: p.hasSowTemplate ? "Template chosen" : null,
      blocked: null,
    },
    {
      id: "sow.generate",
      title: "Generate SOW",
      status: p.hasSow ? (p.sowStale && !p.sowApproved ? "needs_review" : "done") : "not_started",
      summary: p.hasSow ? (p.sowStale && !p.sowApproved ? "Out of date with the project" : "Generated") : null,
      blocked: null,
    },
    {
      id: "sow.approval",
      title: "Client approval",
      status: p.sowApproved ? "done" : "not_started",
      summary: p.sowApproved ? p.sowApprovedLabel : null,
      blocked: !p.hasSow && !p.sowApproved ? "Needs a SOW" : null,
    },
  ];
}

const DRAFTS: Record<StepId, (p: SubTaskInput) => Draft[]> = { brief, estimate, sow };

/**
 * A step's sub-tasks, in order, with the current one marked. On a complete
 * project nothing is current and anything not done reads "Locked".
 */
export function deriveSubTasks(input: SubTaskInput, step: StepId): SubTask[] {
  const drafts = DRAFTS[step](input);
  const complete = input.projectComplete;
  // Specialist inputs stop mattering once an estimate exists (they are not a gate).
  const skipsCurrent = (d: Draft) => d.id === "estimate.specialists" && input.hasEstimate;
  const currentId = complete
    ? null
    : (drafts.find((d) => d.status !== "done" && d.blocked === null && !skipsCurrent(d))?.id ?? null);
  return drafts.map((d, index) => ({
    ...d,
    status: complete && d.status !== "done" ? "locked" : d.status,
    blocked: complete ? null : d.blocked,
    step,
    number: index + 1,
    current: d.id === currentId,
  }));
}

/** The sub-task id the Next step banner's action belongs to, where one overlaps. */
export const SUB_TASK_FOR_ACTION: Partial<Record<string, string>> = {
  create_scope_summary: "brief.scope-summary",
  confirm_scope: "brief.confirm-scope",
  confirm_latest_scope: "brief.confirm-scope",
  choose_capabilities: "estimate.teams",
  prepare_estimate_brief: "estimate.brief",
  wait_specialists: "estimate.specialists",
  build_estimate: "estimate.build",
  review_estimate: "estimate.build",
  approve_estimate: "estimate.approval",
  generate_sow: "sow.generate",
  approve_sow: "sow.approval",
};
