// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StageTracker } from "@/components/features/StageTracker";
import type { WorkflowStepData } from "@/components/features/WorkflowStepList";
import type { ReactNode } from "react";

// Phase 1 (stages 1-4) is now a fluid workspace driven by phase1Status /
// phase1Content, not step cards built from `steps` — so `steps` here only
// needs entries for stages 5-10 (Phase 2, Phase 3, Delivery Monitoring),
// which render exactly as before.
const steps: WorkflowStepData[] = [
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

function renderTracker(
  overrides: {
    phase1Status?: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_SPECIALIST_REVIEW";
    headerExtraByPhaseKey?: Partial<Record<string, ReactNode>>;
  } = {}
) {
  return render(
    <StageTracker
      steps={steps}
      phase1Status={overrides.phase1Status ?? "IN_PROGRESS"}
      phase1Content={<p>Phase 1 workspace content</p>}
      headerExtraByPhaseKey={overrides.headerExtraByPhaseKey}
    />
  );
}

describe("StageTracker", () => {
  it("renders the 3 phases plus a separate Delivery Monitoring indicator", () => {
    renderTracker();

    expect(screen.getByText("Clarifying the brief and scope")).toBeInTheDocument();
    expect(screen.getByText("Estimation and team planning")).toBeInTheDocument();
    expect(screen.getByText("Statement of work and delivery setup")).toBeInTheDocument();
    expect(screen.getByText("Delivery Monitoring")).toBeInTheDocument();
  });

  it("renders the given phase1Content inside Phase 1 instead of step cards", () => {
    renderTracker();

    const clarifying = getPhaseDetails("Clarifying the brief and scope");
    expect(clarifying).toHaveTextContent("Phase 1 workspace content");
    expect(clarifying).not.toHaveTextContent("Step 1.1");
  });

  it("shows Phase 1's simplified status label instead of an x/N stages count", () => {
    const notStarted = renderTracker({ phase1Status: "NOT_STARTED" });
    expect(getPhaseDetails("Clarifying the brief and scope")).toHaveTextContent("Not started");
    notStarted.unmount();

    const inProgress = renderTracker({ phase1Status: "IN_PROGRESS" });
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    inProgress.unmount();

    renderTracker({ phase1Status: "READY_FOR_SPECIALIST_REVIEW" });
    expect(screen.getByText("Ready for specialist review")).toBeInTheDocument();
  });

  it("groups the real step cards under the correct phase for Phase 2 and Phase 3, each stage appearing exactly once", () => {
    renderTracker();

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation).toHaveTextContent("Step 2.1 — Review with Specialist Leads");
    expect(estimation).toHaveTextContent("Step 2.3 — Estimation Session");
    expect(estimation).not.toHaveTextContent("Commercials & SOW");

    const sow = getPhaseDetails("Statement of work and delivery setup");
    expect(sow).toHaveTextContent("Step 3.1 — Commercials & SOW");
    expect(sow).toHaveTextContent("Step 3.2 — Planning & Capability Briefing");

    // No duplication: every phased stage's step card renders exactly once.
    // Stage 10 is deliberately excluded — it only appears in the separate
    // Delivery Monitoring block.
    const phaseScopedLabels = ["2.1", "2.2", "2.3", "3.1", "3.2"];
    steps
      .filter((s) => s.stageNumber !== 10)
      .forEach((step, i) => {
        expect(
          screen.getAllByText(`Step ${phaseScopedLabels[i]} — ${step.name}`)
        ).toHaveLength(1);
      });
  });

  it("labels each Phase 2/3 step with a Phase-scoped number (P.N), not the flat 1-10 stage number", () => {
    renderTracker();

    expect(screen.getByText("2.1")).toBeInTheDocument(); // Review with Specialist Leads, NOT_STARTED
    expect(screen.getByText("3.1")).toBeInTheDocument(); // Commercials & SOW, NOT_STARTED
    expect(screen.queryByText("6")).not.toBeInTheDocument();
    expect(screen.queryByText("7")).not.toBeInTheDocument();
    expect(screen.queryByText("9")).not.toBeInTheDocument();
  });

  it("shows each Phase 2/3 step's real status badge and agent/human-input kind, not a plain numbered dot", () => {
    renderTracker();

    expect(screen.getAllByText("AI Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Human Input").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("expands Phase 1 by default while it's not yet ready for specialist review", () => {
    renderTracker({ phase1Status: "IN_PROGRESS" });

    expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(true);
    expect(getPhaseDetails("Estimation and team planning").open).toBe(false);
    expect(getPhaseDetails("Statement of work and delivery setup").open).toBe(false);
  });

  it("expands the active Phase 2/3 phase instead, once Phase 1 is ready for specialist review", () => {
    renderTracker({ phase1Status: "READY_FOR_SPECIALIST_REVIEW" });

    expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(false);
    expect(getPhaseDetails("Estimation and team planning").open).toBe(true);
  });

  it("lets a collapsed phase be expanded by clicking its summary", async () => {
    renderTracker();
    const user = userEvent.setup();

    const estimation = getPhaseDetails("Estimation and team planning");
    expect(estimation.open).toBe(false);

    await user.click(screen.getByText("Estimation and team planning"));

    expect(estimation.open).toBe(true);
  });

  it("still shows the separate Delivery Monitoring indicator for stage 10, untouched by the Phase 1 change", () => {
    renderTracker();

    expect(screen.getByText(/Commercial Status Monitoring/)).toBeInTheDocument();
    expect(screen.getByText("Later")).toBeInTheDocument();
  });

  describe("Phase 1 header extra (headerExtraByPhaseKey.clarifying)", () => {
    it("shows Phase 1's header extra content in the summary row while Phase 1 is expanded", () => {
      renderTracker({
        phase1Status: "IN_PROGRESS",
        headerExtraByPhaseKey: { clarifying: <span>4 of 5 confirmed</span> },
      });

      expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(true);
      expect(screen.getByText("4 of 5 confirmed")).toBeInTheDocument();
    });

    it("keeps showing Phase 1's header extra content even while Phase 1 is collapsed", () => {
      renderTracker({
        phase1Status: "READY_FOR_SPECIALIST_REVIEW",
        headerExtraByPhaseKey: { clarifying: <span>4 of 5 confirmed</span> },
      });

      expect(getPhaseDetails("Clarifying the brief and scope").open).toBe(false);
      expect(screen.getByText("4 of 5 confirmed")).toBeInTheDocument();
    });

    it("renders nothing extra for Phase 1 when no override is given and it has no plain stages in `steps`", () => {
      renderTracker();

      // This suite's `steps` fixture only covers stages 5-10, so Phase 1 has
      // no stages of its own to auto-build a fallback strip from — and,
      // separately, Phase 1 never falls back to the generic per-stage strip
      // even when it does have stages (see the dedicated test below).
      expect(screen.queryByText("4 of 5 confirmed")).not.toBeInTheDocument();
    });

    it("never falls back to the generic per-stage strip for Phase 1, even if it has stages and no override", () => {
      const stepsWithPhase1Stages: WorkflowStepData[] = [
        { stageNumber: 1, name: "Intake", status: "COMPLETE", content: <p>Intake content</p> },
        { stageNumber: 2, name: "Clarification Email Sent", status: "NOT_STARTED", content: <p /> },
        ...steps,
      ];
      render(
        <StageTracker
          steps={stepsWithPhase1Stages}
          phase1Status="IN_PROGRESS"
          phase1Content={<p>Phase 1 workspace content</p>}
        />
      );

      const clarifying = getPhaseDetails("Clarifying the brief and scope");
      expect(clarifying).not.toHaveTextContent("stages complete");
    });

    it("never shows Phase 1's header extra content under Phase 2 or Phase 3's headers", () => {
      renderTracker({ headerExtraByPhaseKey: { clarifying: <span>4 of 5 confirmed</span> } });

      const estimation = getPhaseDetails("Estimation and team planning");
      expect(estimation).not.toHaveTextContent("4 of 5 confirmed");
    });

    it("still toggles expand/collapse when clicking directly on the header extra content", async () => {
      const user = userEvent.setup();
      renderTracker({
        phase1Status: "READY_FOR_SPECIALIST_REVIEW",
        headerExtraByPhaseKey: { clarifying: <span>4 of 5 confirmed</span> },
      });

      const clarifying = getPhaseDetails("Clarifying the brief and scope");
      expect(clarifying.open).toBe(false);

      await user.click(screen.getByText("4 of 5 confirmed"));

      expect(clarifying.open).toBe(true);
    });
  });

  describe("Phase 2/3 auto-built stage-completion strip", () => {
    it("shows an auto-built stage-completion strip for Phase 2 when no override is given", () => {
      renderTracker();

      const estimation = getPhaseDetails("Estimation and team planning");
      expect(estimation).toHaveTextContent("0 of 3 stages complete");
    });

    it("shows an auto-built stage-completion strip for Phase 3 when no override is given", () => {
      renderTracker();

      const sow = getPhaseDetails("Statement of work and delivery setup");
      expect(sow).toHaveTextContent("0 of 2 stages complete");
    });

    it("counts completed stages correctly in the headline", () => {
      const completedSteps: WorkflowStepData[] = steps.map((step) =>
        step.stageNumber === 5 || step.stageNumber === 6 ? { ...step, status: "COMPLETE" } : step
      );
      render(
        <StageTracker
          steps={completedSteps}
          phase1Status="IN_PROGRESS"
          phase1Content={<p>Phase 1 workspace content</p>}
        />
      );

      const estimation = getPhaseDetails("Estimation and team planning");
      expect(estimation).toHaveTextContent("2 of 3 stages complete");
    });

    it("keeps showing Phase 2/3's auto-built strip even while collapsed", () => {
      renderTracker({ phase1Status: "IN_PROGRESS" });

      // Phase 1 is expanded by default here, so Phase 2/3 are collapsed.
      expect(getPhaseDetails("Estimation and team planning").open).toBe(false);
      expect(getPhaseDetails("Estimation and team planning")).toHaveTextContent(
        "0 of 3 stages complete"
      );
    });

    it("lets a caller override the auto-built strip for a non-Phase-1 phase", () => {
      renderTracker({ headerExtraByPhaseKey: { estimation: <span>Custom estimation summary</span> } });

      const estimation = getPhaseDetails("Estimation and team planning");
      expect(estimation).toHaveTextContent("Custom estimation summary");
      expect(estimation).not.toHaveTextContent("stages complete");
    });
  });
});
