// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowStepList, type WorkflowStepData } from "@/components/features/WorkflowStepList";

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
];

describe("WorkflowStepList", () => {
  it("expands the first non-complete step by default", () => {
    render(<WorkflowStepList steps={steps} />);

    expect(
      screen.getByRole("button", { name: /Step 3 — Get Clarifications/ })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Clarifications content")).toBeInTheDocument();
    expect(screen.queryByText("Intake output")).not.toBeInTheDocument();
  });

  it("shows the correct status label per step", () => {
    render(<WorkflowStepList steps={steps} />);

    expect(screen.getAllByText("Complete")).toHaveLength(2);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("toggles a step's content when its header is clicked", async () => {
    const user = userEvent.setup();
    render(<WorkflowStepList steps={steps} />);

    const intakeHeader = screen.getByRole("button", { name: /Step 1 — Intake/ });
    expect(intakeHeader).toHaveAttribute("aria-expanded", "false");

    await user.click(intakeHeader);

    expect(intakeHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Intake output")).toBeInTheDocument();
  });
});
