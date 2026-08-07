// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  submitClarificationNotesAction: vi.fn(),
  runTriageAgentAction: vi.fn(),
}));

const { ProjectWorkflow } = await import("@/components/features/ProjectWorkflow");

const STAGE_NAMES = [
  "Intake",
  "Clarification Email Sent",
  "Get Clarifications",
  "Triage",
  "Review with Specialist Leads",
  "Estimation Kick Off",
  "Estimation Session",
  "Commercials & SOW",
  "Planning & Capability Briefing",
  "Commercial Status Monitoring",
];

const positionDocument = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: ["Target audience"],
  clientFlaggedOpenItems: ["Budget"],
};

const clarificationEmail = { subject: "Quick questions", bodyText: "Hi Jamie," };

const draftScope = {
  objectives: ["Refresh the campaign"],
  deliverables: ["Creative assets"],
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: {
    contacts: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
    capabilities: ["Creative"],
  },
  budget: { summary: "Not yet confirmed", isConfirmed: false },
  assumptionsAndConstraints: ["Assumed UK market only"],
  flaggedGaps: ["Target audience still unknown"],
};

/**
 * WorkflowStepList auto-expands only the first non-COMPLETE step (and keeps
 * that as local state thereafter), so each test must mark every earlier
 * stage COMPLETE for the stage under test to actually render its content.
 */
function stagesUpTo(currentStageNumber: number, currentStatus: "NOT_STARTED" | "IN_PROGRESS") {
  return STAGE_NAMES.map((name, i) => {
    const stageNumber = i + 1;
    return {
      stageNumber,
      name,
      status:
        stageNumber < currentStageNumber
          ? ("COMPLETE" as const)
          : stageNumber === currentStageNumber
            ? currentStatus
            : ("NOT_STARTED" as const),
    };
  });
}

function baseProps() {
  return {
    projectId: "proj_1",
    projectName: "Test Project",
    briefFileName: "brief.txt",
    stages: stagesUpTo(3, "IN_PROGRESS"),
    clarificationEmail,
    positionDocument,
    checklistItems: [],
    clarificationNotes: null as string | null,
    draftScopeDocument: null as typeof draftScope | null,
  };
}

describe("ProjectWorkflow", () => {
  it("shows the clarification notes form on Step 3 when no notes have been submitted yet", () => {
    render(<ProjectWorkflow {...baseProps()} />);

    expect(
      screen.getByPlaceholderText(/Paste the client's clarification reply here/)
    ).toBeInTheDocument();
  });

  it("shows the submitted notes read-only and the updated Position Document once notes exist", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        clarificationNotes="The client confirmed the budget at 250k."
      />
    );

    expect(screen.getByText("The client confirmed the budget at 250k.")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Paste the client's clarification reply here/)
    ).not.toBeInTheDocument();
  });

  it("shows a waiting message on Step 4 when Step 3 has not completed", () => {
    render(<ProjectWorkflow {...baseProps()} stages={stagesUpTo(4, "NOT_STARTED")} />);

    expect(screen.getByText(/Waiting on Step 3 to complete/)).toBeInTheDocument();
  });

  it("shows the Run Triage Agent action once Step 4 is unlocked", () => {
    render(<ProjectWorkflow {...baseProps()} stages={stagesUpTo(4, "IN_PROGRESS")} />);

    expect(screen.getByRole("button", { name: "Run Triage Agent" })).toBeInTheDocument();
  });

  it("shows the Draft Scope Document with flagged gaps once it exists", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        stages={stagesUpTo(4, "IN_PROGRESS")}
        draftScopeDocument={draftScope}
      />
    );

    expect(screen.getByText("⚠ Gaps Carried Forward for Specialists")).toBeInTheDocument();
    expect(screen.getByText("Target audience still unknown")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run Triage Agent" })
    ).not.toBeInTheDocument();
  });
});
