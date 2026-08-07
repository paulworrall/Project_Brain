// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("StageTracker", () => {
  it("renders every stage's name and marks completed stages with a check mark", () => {
    render(<StageTracker stages={stages} />);

    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("Commercial Status Monitoring")).toBeInTheDocument();
    expect(screen.getAllByText("✓")).toHaveLength(2);
  });

  it("shows a stage number (not a check mark) for stages that aren't complete", () => {
    render(<StageTracker stages={stages} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("labels the not-yet-built stages (6-10) as coming later", () => {
    render(<StageTracker stages={stages} />);

    expect(screen.getAllByText("Later")).toHaveLength(5);
  });
});
