// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  submitClientUpdateAction: vi.fn(),
  generateDraftScopeDocumentAction: vi.fn(),
  updateChecklistItemDetailAction: vi.fn(),
  submitSpecialistFeedbackAction: vi.fn(),
  updateOtherServiceLabelAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  uploadKnowledgeItemAction: vi.fn(),
  askChatbotAction: vi.fn(),
  startSowDevelopmentAction: vi.fn(),
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

const deliverablesServices = {
  deliverables: ["Creative concept territories"],
  services: {
    experienceCreative: { involvement: "Lead concept and design." },
    business: { involvement: "Not required." },
    architecture: { involvement: "Not required." },
    techAndData: { involvement: "Not required." },
    orchestration: { involvement: "Coordinate the campaign schedule." },
    other: { involvement: "Legal review of influencer usage.", label: "Legal & Compliance" },
  },
  openQuestionsRisks: ["POS print lead time risk"],
  outstandingGapsCarriedForward: ["Talent usage undefined"],
};

/**
 * WorkflowStepList (used by Phase 2/3) auto-expands only the first
 * non-COMPLETE step, so each test must mark every earlier stage COMPLETE for
 * the stage under test to actually render its content.
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
    // Stages 1-4 complete by default — Phase 1's own content no longer
    // depends on per-stage gating (it's a fluid workspace), only Phase 2's
    // Stage 5 step does.
    stages: stagesUpTo(5, "IN_PROGRESS"),
    clarificationEmail,
    positionDocument,
    clientUpdates: [] as { id: string; content: string; createdAt: Date; createdByName: string | null }[],
    checklistItems: [] as {
      id: string;
      label: string;
      isComplete: boolean;
      detailText: string | null;
    }[],
    draftScopeDocument: null as typeof draftScope | null,
    draftScopeDocumentMeta: null as { versionNumber: number; createdAt: Date } | null,
    specialistFeedback: null as string | null,
    deliverablesServicesDocument: null as typeof deliverablesServices | null,
    knowledgeItems: [],
    currentSowTemplate: null as { id: string; name: string } | null,
    currentSowTemplateVersion: null as { id: string } | null,
    sowTemplateOptions: [] as {
      id: string;
      name: string;
      isBaseline: boolean;
      versions: { id: string; versionNumber: number; fileName: string; status: "ENABLED" | "DISABLED" }[];
    }[],
    kickOffDate: null as Date | null,
    targetCompletionDate: null as Date | null,
  };
}

describe("ProjectWorkflow", () => {
  it("renders the Phase 1 workspace with the live Position Document instead of step cards", () => {
    render(<ProjectWorkflow {...baseProps()} />);

    expect(screen.getByText("Refresh the campaign.")).toBeInTheDocument();
    expect(screen.getByText("Target audience")).toBeInTheDocument();
    expect(screen.queryByText("Step 1.1")).not.toBeInTheDocument();
  });

  it("shows past client updates in the log", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        clientUpdates={[
          {
            id: "note_1",
            content: "The referral feature is confirmed in scope after all.",
            createdAt: new Date("2026-08-01T10:00:00Z"),
            createdByName: "Alex Morgan",
          },
        ]}
      />
    );

    expect(
      screen.getByText("The referral feature is confirmed in scope after all.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Alex Morgan/)).toBeInTheDocument();
  });

  it("shows a compact Draft Scope Document summary — not the full content — once it has been generated", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        draftScopeDocument={draftScope}
        draftScopeDocumentMeta={{ versionNumber: 1, createdAt: new Date("2026-08-01T10:00:00Z") }}
      />
    );

    expect(screen.getByText(/1 gap flagged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View full draft/ })).toHaveAttribute(
      "href",
      "/projects/proj_1/outputs/DRAFT_SCOPE_DOCUMENT"
    );
    // Full inline content (including the gaps warning) no longer renders here.
    expect(screen.queryByText("⚠ Gaps Carried Forward for Specialists")).not.toBeInTheDocument();
    expect(screen.queryByText("Target audience still unknown")).not.toBeInTheDocument();
  });

  it("shows the specialist feedback form on Step 5 when no feedback has been submitted yet", () => {
    render(<ProjectWorkflow {...baseProps()} stages={stagesUpTo(5, "IN_PROGRESS")} />);

    expect(
      screen.getByPlaceholderText(/Paste the specialist leads' feedback/)
    ).toBeInTheDocument();
  });

  it("shows the checklist exactly once, in the sidebar — not duplicated in the Phase 1 workspace", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        checklistItems={[
          { id: "item_1", label: "Assign job code", isComplete: false, detailText: null },
        ]}
      />
    );

    expect(screen.getAllByRole("checkbox", { name: "Assign job code" })).toHaveLength(1);
    expect(screen.getAllByText("Project Set-Up Checklist")).toHaveLength(1);
  });

  it("shows submitted specialist feedback read-only and the Deliverables + Services Document", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        stages={stagesUpTo(5, "IN_PROGRESS")}
        specialistFeedback="Creative needs 2 concept rounds."
        deliverablesServicesDocument={deliverablesServices}
      />
    );

    expect(screen.getByText("Creative needs 2 concept rounds.")).toBeInTheDocument();
    expect(screen.getByText("Legal & Compliance")).toBeInTheDocument();
    expect(screen.getByText("Legal review of influencer usage.")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Paste the specialist leads' feedback/)
    ).not.toBeInTheDocument();
  });

  it("shows the Brief Readiness strip in Phase 1's header row, derived from the live Position Document", () => {
    render(<ProjectWorkflow {...baseProps()} />);

    expect(screen.getByText(/Brief Readiness — \d of 5 confirmed/)).toBeInTheDocument();
  });

  it("keeps the Brief Readiness strip visible in the header even after Phase 1 collapses", () => {
    render(
      <ProjectWorkflow
        {...baseProps()}
        draftScopeDocument={draftScope}
        draftScopeDocumentMeta={{ versionNumber: 1, createdAt: new Date("2026-08-01T10:00:00Z") }}
      />
    );

    const clarifyingDetails = screen.getByText("Clarifying the brief and scope").closest("details");
    expect(clarifyingDetails?.open).toBe(false);
    expect(screen.getByText(/Brief Readiness — \d of 5 confirmed/)).toBeInTheDocument();
  });

  it("does not show the Brief Readiness strip once inside the expanded body — only in the header", () => {
    render(<ProjectWorkflow {...baseProps()} />);

    // Only one occurrence: the header-row version. The expanded "Current
    // position" body no longer renders its own copy.
    expect(screen.getAllByText(/Brief Readiness — \d of 5 confirmed/)).toHaveLength(1);
  });
});
