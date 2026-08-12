// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StageTracker } from "@/components/features/StageTracker";
import type { WorkflowStepData } from "@/components/features/WorkflowStepList";

const steps: WorkflowStepData[] = [
  { stageNumber: 1, name: "Intake", status: "COMPLETE", content: <p>Intake output</p> },
  {
    stageNumber: 2,
    name: "Clarification Email Sent",
    status: "COMPLETE",
    content: <p>Email output</p>,
  },
  {
    stageNumber: 3,
    name: "Get Clarifications",
    status: "IN_PROGRESS",
    content: <p>Clarifications content</p>,
  },
  { stageNumber: 4, name: "Triage", status: "NOT_STARTED", content: <p>Triage content</p> },
  {
    stageNumber: 5,
    name: "Review with Specialist Leads",
    status: "NOT_STARTED",
    content: <p>Specialist review content</p>,
  },
  {
    stageNumber: 6,
    name: "Estimation Kick Off",
    status: "NOT_STARTED",
    content: <p>Estimation kick off content</p>,
  },
  {
    stageNumber: 7,
    name: "Estimation Session",
    status: "NOT_STARTED",
    content: <p>Estimation session content</p>,
  },
  {
    stageNumber: 8,
    name: "Commercials & SOW",
    status: "NOT_STARTED",
    content: <p>Commercials content</p>,
  },
  {
    stageNumber: 9,
    name: "Planning & Capability Briefing",
    status: "NOT_STARTED",
    content: <p>Planning content</p>,
  },
  {
    stageNumber: 10,
    name: "Commercial Status Monitoring",
    status: "NOT_STARTED",
    content: <p>Status monitoring content</p>,
  },
];

function getPhaseDetails(name: string): HTMLDetailsElement {
  const summary = screen.getByText(name).closest("summary");
  if (!summary) throw new Error(`no <summary> found for phase "${name}"`);
  const details = summary.closest("details");
  if (!details) throw new Error(`no <details> found for phase "${name}"`);
  return details;
}

describe("StageTracker", () => {
  it("renders the 3 phases plus a separate Delivery Monitoring indicator", () => {
    render(<StageTracker steps={steps} />);

    expect(screen.getByText("Clarifying the brief and scope")).toBeInTheDocument();
    expect(screen.getByText("Estimation and team planning")).toBeInTheDocument();
    expect(screen.getByText("Statement of work and delivery setup")).toBeInTheDocument();
    expect(screen.getByText("Delivery Monitoring")).toBeInTheDocument();
  });

  it("groups the real step cards under the correct phase, each stage appearing exactly once", () => {
    render(<StageTracker steps={steps} />);

    const clarifying = getPhaseDetails("Clarifying the brief and scope");
    expect(clarifying).toHaveTextContent("Step 1 — Intake");
    expect(clarifying).toHaveTextContent("Step 4 — Triage");
    expect(clarifying).not.toHaveTextContent("Estimation Kick Off");

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation).toHaveTextContent("Step 5 — Review with Specialist Leads");
    expect(estimation).toHaveTextContent("Step 7 — Estimation Session");
    expect(estimation).not.toHaveTextContent("Commercials & SOW");

    const sow = getPhaseDetails("Statement of work and delivery setup");
    expect(sow).toHaveTextContent("Step 8 — Commercials & SOW");
    expect(sow).toHaveTextContent("Step 9 — Planning & Capability Briefing");

    // No duplication: every phased stage's step card renders exactly once on
    // the page. Stage 10 is deliberately excluded — it's not part of any
    // Phase, and only ever appears in the separate Delivery Monitoring block.
    for (const step of steps.filter((s) => s.stageNumber !== 10)) {
      expect(screen.getAllByText(`Step ${step.stageNumber} — ${step.name}`)).toHaveLength(1);
    }
  });

  it("shows each step's real status badge and agent/human-input kind, not a plain numbered dot", () => {
    render(<StageTracker steps={steps} />);

    expect(screen.getAllByText("Complete")).toHaveLength(2);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getAllByText("AI Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Human Input").length).toBeGreaterThan(0);
  });

  it("expands only the active (non-complete) phase by default, auto-expanding its current step's content", () => {
    render(<StageTracker steps={steps} />);

    expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(true);
    expect(getPhaseDetails("Estimation and team planning").open).toBe(false);
    expect(getPhaseDetails("Statement of work and delivery setup").open).toBe(false);

    expect(screen.getByText("Clarifications content")).toBeInTheDocument();
    expect(screen.queryByText("Intake output")).not.toBeInTheDocument();
  });

  it("lets a collapsed phase be expanded by clicking its summary", async () => {
    render(<StageTracker steps={steps} />);
    const user = userEvent.setup();

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation.open).toBe(false);

    await user.click(screen.getByText("Estimation and team planning"));

    expect(estimation.open).toBe(true);
  });

  it("still shows the separate Delivery Monitoring indicator for stage 10, untouched by the step-card change", () => {
    render(<StageTracker steps={steps} />);

    expect(screen.getByText(/Commercial Status Monitoring/)).toBeInTheDocument();
    expect(screen.getByText("Later")).toBeInTheDocument();
  });
});
