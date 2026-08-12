// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StageTracker } from "@/components/features/StageTracker";
import type { WorkflowStep } from "@/types/workflow";

const stages: WorkflowStep[] = [
  { stageNumber: 1, name: "Intake", status: "COMPLETE" },
  { stageNumber: 2, name: "Clarification Email Sent", status: "COMPLETE" },
  { stageNumber: 3, name: "Get Clarifications", status: "IN_PROGRESS" },
  { stageNumber: 4, name: "Triage", status: "NOT_STARTED" },
  { stageNumber: 5, name: "Review with Specialist Leads", status: "NOT_STARTED" },
  { stageNumber: 6, name: "Estimation Kick Off", status: "NOT_STARTED" },
  { stageNumber: 7, name: "Estimation Session", status: "NOT_STARTED" },
  { stageNumber: 8, name: "Commercials & SOW", status: "NOT_STARTED" },
  { stageNumber: 9, name: "Planning & Capability Briefing", status: "NOT_STARTED" },
  { stageNumber: 10, name: "Commercial Status Monitoring", status: "NOT_STARTED" },
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
    render(<StageTracker stages={stages} />);

    expect(screen.getByText("Clarifying the brief and scope")).toBeInTheDocument();
    expect(screen.getByText("Estimation and team planning")).toBeInTheDocument();
    expect(screen.getByText("Statement of work and delivery setup")).toBeInTheDocument();
    expect(screen.getByText("Delivery Monitoring")).toBeInTheDocument();
  });

  it("groups stages under the correct phase", () => {
    render(<StageTracker stages={stages} />);

    const clarifying = getPhaseDetails("Clarifying the brief and scope");
    expect(clarifying).toHaveTextContent("Intake");
    expect(clarifying).toHaveTextContent("Triage");
    expect(clarifying).not.toHaveTextContent("Estimation Kick Off");

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation).toHaveTextContent("Review with Specialist Leads");
    expect(estimation).toHaveTextContent("Estimation Session");
    expect(estimation).not.toHaveTextContent("Commercials & SOW");

    const sow = getPhaseDetails("Statement of work and delivery setup");
    expect(sow).toHaveTextContent("Commercials & SOW");
    expect(sow).toHaveTextContent("Planning & Capability Briefing");
  });

  it("expands only the active (non-complete) phase by default", () => {
    render(<StageTracker stages={stages} />);

    expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(true);
    expect(getPhaseDetails("Estimation and team planning").open).toBe(false);
    expect(getPhaseDetails("Statement of work and delivery setup").open).toBe(false);
  });

  it("lets a collapsed phase be expanded by clicking its summary", async () => {
    render(<StageTracker stages={stages} />);
    const user = userEvent.setup();

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation.open).toBe(false);

    await user.click(screen.getByText("Estimation and team planning"));

    expect(estimation.open).toBe(true);
  });

  it("marks the not-yet-built stages as coming later, both in-phase and for Delivery Monitoring", () => {
    render(<StageTracker stages={stages} />);

    expect(screen.getAllByText("(Later)")).toHaveLength(4);
    expect(screen.getByText(/Commercial Status Monitoring/)).toBeInTheDocument();
  });
});
