/**
 * FB-009 C: the project's one next action — a title, a one-line reason and
 * one primary button. Pure and shared by server and UI (the project page's
 * Next step banner and the pipeline home page). Ordered rules, first match
 * wins. Buttons are links to the place on the page where the action is done
 * (they never act on their own), so the banner never duplicates a dialog.
 */
import type { StepId } from "@/lib/projectSteps";

export type BriefAssessmentLevel = "complete" | "partial" | "thin";

export interface NextActionInput {
  projectId: string;
  projectComplete: boolean;
  /** The approved SOW's download link (for the complete state). */
  approvedSowHref: string | null;
  hasScopeSummary: boolean;
  /** A pre-FB-009 project with a Position Document / Draft Scope. */
  hasEarlierDocuments: boolean;
  /** Stored open questions plus required key details outstanding. */
  openQuestions: number;
  clarificationSent: boolean;
  /** The Intake Agent's judgement (FB-009 D); null for older projects. */
  briefAssessment: BriefAssessmentLevel | null;
  scopeConfirmed: boolean;
  /** A newer Scope summary version exists than the confirmed one. */
  scopeNewerThanConfirmed: boolean;
  capabilityCount: number;
  hasEstimateBrief: boolean;
  specialistReceived: number;
  specialistTotal: number;
  hasEstimate: boolean;
  estimateStale: boolean;
  estimateApproved: boolean;
  hasSow: boolean;
  sowStale: boolean;
  sowApproved: boolean;
}

export type NextActionId =
  | "complete"
  | "create_scope_summary"
  | "send_clarification"
  | "confirm_scope"
  | "confirm_latest_scope"
  | "choose_capabilities"
  | "prepare_estimate_brief"
  | "wait_specialists"
  | "build_estimate"
  | "review_estimate"
  | "approve_estimate"
  | "generate_sow"
  | "approve_sow";

export interface NextAction {
  id: NextActionId;
  title: string;
  reason: string;
  /** The step the action belongs to. */
  step: StepId;
  button: { label: string; href: string };
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The final rule list, in order (reported in the FB-009 note). */
export function deriveNextAction(p: NextActionInput): NextAction {
  const at = (step: StepId, anchor: string) => `/projects/${p.projectId}/${step}#${anchor}`;

  if (p.projectComplete) {
    return {
      id: "complete",
      title: "Project complete: SOW approved",
      reason: "The client approved the Statement of Work. Changes will need a change request.",
      step: "sow",
      button: { label: "Download the approved SOW", href: p.approvedSowHref ?? at("sow", "sow") },
    };
  }
  if (!p.hasScopeSummary && p.hasEarlierDocuments) {
    return {
      id: "create_scope_summary",
      title: "Create the scope summary",
      reason:
        "This project was set up before scope summaries. Merge its earlier documents into one.",
      step: "brief",
      button: { label: "Create scope summary", href: at("brief", "scope-summary") },
    };
  }
  if (
    p.openQuestions > 0 &&
    !p.clarificationSent &&
    !p.scopeConfirmed &&
    p.briefAssessment !== "complete"
  ) {
    return {
      id: "send_clarification",
      title: "Send the clarification email",
      reason: `${plural(p.openQuestions, "open question")} still need the client's answer.`,
      step: "brief",
      button: { label: "Open the email", href: at("brief", "clarification-email") },
    };
  }
  if (!p.scopeConfirmed) {
    return {
      id: "confirm_scope",
      title: "Confirm the scope is ready to estimate",
      reason:
        p.briefAssessment === "complete"
          ? "This brief looks complete. Confirm the scope to move on to the estimate."
          : p.openQuestions > 0
            ? `${plural(p.openQuestions, "open question")} remain, but you can confirm when the scope is clear enough.`
            : "Everything needed to estimate is captured.",
      step: "brief",
      button: { label: "Confirm scope", href: at("brief", "scope-gate") },
    };
  }
  if (p.scopeNewerThanConfirmed && !p.estimateApproved) {
    return {
      id: "confirm_latest_scope",
      title: "Confirm the latest scope",
      reason: "The scope summary has changed since it was confirmed.",
      step: "brief",
      button: { label: "Review the scope summary", href: at("brief", "scope-summary") },
    };
  }
  if (p.capabilityCount === 0) {
    return {
      id: "choose_capabilities",
      title: "Choose who should estimate this",
      reason: "No specialist capabilities are confirmed yet.",
      step: "estimate",
      button: { label: "Choose capabilities", href: at("estimate", "capabilities") },
    };
  }
  if (!p.hasEstimateBrief) {
    return {
      id: "prepare_estimate_brief",
      title: "Prepare the estimate brief",
      reason: "The specialists need a brief to estimate from.",
      step: "estimate",
      button: { label: "Prepare the estimate brief", href: at("estimate", "capabilities") },
    };
  }
  const outstanding = p.specialistTotal - p.specialistReceived;
  if (outstanding > 0 && !p.hasEstimate) {
    return {
      id: "wait_specialists",
      title: `Waiting on ${outstanding} of ${plural(p.specialistTotal, "specialist input")}`,
      reason: "Track who you've asked and what has come back.",
      step: "estimate",
      button: { label: "Open the tracker", href: at("estimate", "specialist-inputs") },
    };
  }
  if (!p.hasEstimate) {
    return {
      id: "build_estimate",
      title: "Build the estimate",
      reason: "Add each team's roles and price them against the rate card.",
      step: "estimate",
      button: { label: "Build the estimate", href: at("estimate", "estimates") },
    };
  }
  if (p.estimateStale && !p.estimateApproved) {
    return {
      id: "review_estimate",
      title: "Review the estimate: scope changed",
      reason: "A newer scope was confirmed after this estimate was saved.",
      step: "estimate",
      button: { label: "Review the estimate", href: at("estimate", "estimates") },
    };
  }
  if (!p.estimateApproved) {
    return {
      id: "approve_estimate",
      title: "Get client approval for the estimate",
      reason: "Send the estimate to the client, then record their approval.",
      step: "estimate",
      button: { label: "Mark as client approved", href: at("estimate", "estimates") },
    };
  }
  if (!p.hasSow || p.sowStale) {
    return {
      id: "generate_sow",
      title: "Generate the SOW",
      reason: p.hasSow
        ? "The SOW is out of date with the project."
        : "The estimate is approved. Generate the Statement of Work from it.",
      step: "sow",
      button: {
        label: p.hasSow ? "Regenerate the SOW" : "Generate the SOW",
        href: at("sow", "sow"),
      },
    };
  }
  return {
    id: "approve_sow",
    title: "Get client approval for the SOW",
    reason: "Send the SOW to the client, then record their approval.",
    step: "sow",
    button: { label: "Mark as client approved", href: at("sow", "sow") },
  };
}
