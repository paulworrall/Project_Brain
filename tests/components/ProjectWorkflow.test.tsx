// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Capability } from "@/generated/prisma/enums";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateOtherServiceLabelAction: vi.fn(),
  startSowDevelopmentAction: vi.fn(),
  generateSowAction: vi.fn(),
  suggestCapabilitiesAction: vi.fn(),
  updateConfirmedCapabilitiesAction: vi.fn(),
  generateEstimateBriefAction: vi.fn(),
  saveBriefAttributeAction: vi.fn(),
  rereadBriefAttributesAction: vi.fn(),
  updatePmPerspectiveFieldAction: vi.fn(),
}));

vi.mock("@/app/(dashboard)/projects/[projectId]/sow-review-actions", () => ({
  startSowReviewAction: vi.fn(),
  saveSowReviewStepAction: vi.fn(),
  saveSowItemAction: vi.fn(),
  revertSowItemAction: vi.fn(),
  acceptSowSuggestionAction: vi.fn(),
  dismissSowSuggestionAction: vi.fn(),
  addSowItemAction: vi.fn(),
  deleteSowItemAction: vi.fn(),
}));

vi.mock("@/app/(dashboard)/projects/[projectId]/estimates/actions", () => ({
  createEstimateAction: vi.fn(),
  addOrReviseCapabilityInputAction: vi.fn(),
  analyzeAndBuildEstimateAction: vi.fn(),
  resolveRoleResolutionAction: vi.fn(),
  saveEstimateVersionAction: vi.fn(),
}));

const { BriefStep, EstimateStep, SowStep } = await import("@/components/features/ProjectWorkflow");
const { buildSpecialistRows } = await import("@/lib/project/readiness");
const { briefCompleteness, briefRecord } = await import("../fixtures/briefCompleteness");
const { pmPerspectiveView } = await import("../fixtures/pmPerspective");

function common(projectComplete = false) {
  return { projectId: "p1", projectComplete };
}

function briefProps(overrides: Partial<Parameters<typeof BriefStep>[0]> = {}) {
  return {
    ...common(),
    scopeSummary: null,
    earlierDocuments: { positionDocument: null, draftScopeDocument: null },
    openQuestions: 2,
    missingMsaRateCard: false,
    clientName: "Fizzy",
    clientUpdates: [],
    briefCompleteness: briefCompleteness([
      briefRecord("budget", { amount: "£50,000", currency: "GBP" }),
    ]),
    pmPerspective: pmPerspectiveView(),
    scopeConfirmedAt: null,
    scopeConfirmedByName: null,
    estimateApproved: false,
    ...overrides,
  };
}

function estimateProps(overrides: Partial<Parameters<typeof EstimateStep>[0]> = {}) {
  const confirmed: Capability[] = ["EXPERIENCE_DESIGN", "TECH_AND_DATA", "BUSINESS_ARCHITECTURE"];
  return {
    ...common(),
    scopeConfirmed: false,
    confirmedCapabilities: confirmed,
    estimateBriefVersion: null,
    specialistRows: buildSpecialistRows(confirmed, [
      { capability: "EXPERIENCE_DESIGN", status: "received", note: "From Sam" },
      { capability: "TECH_AND_DATA", status: "received", note: null },
    ]),
    estimates: [],
    rateCardOptions: [],
    estimateLock: null,
    approvalPermissions: { canApprove: true, canRevert: false },
    ...overrides,
  };
}

function sowProps(overrides: Partial<Parameters<typeof SowStep>[0]> = {}) {
  return {
    ...common(),
    estimateApproved: false,
    currentSowTemplate: { id: "t1", name: "Standard SOW Template" },
    currentSowTemplateVersion: { id: "tv1" },
    sowTemplateOptions: [],
    sowVersions: [],
    briefCompleteness: briefCompleteness([
      briefRecord("budget", { amount: "£50,000", currency: "GBP" }),
    ]),
    sowLock: null,
    approvalPermissions: { canApprove: true, canRevert: false },
    ...overrides,
  };
}

describe("Brief step", () => {
  it("is headed 'Brief' and has no readiness list, checklist items or system checks (FB-011)", () => {
    render(<BriefStep {...briefProps()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Brief" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Before you move on" })).toBeNull();
    expect(screen.queryByText("Before you move on")).toBeNull();
    expect(screen.queryByRole("list", { name: "Automatic checks" })).toBeNull();
    expect(screen.queryByText("Assign job code")).toBeNull();
    expect(screen.queryByText("MSA and rate card set on the project")).toBeNull();
  });

  it("keeps the Scope summary with its Copy questions button, drops the Clarification email, and ends with the confirm-scope gate", () => {
    render(<BriefStep {...briefProps()} />);
    expect(screen.getByRole("region", { name: "Scope summary" })).toBeInTheDocument();
    expect(screen.queryByText("Clarification email")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirm scope is ready to estimate" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Capabilities & Estimate Brief/i)).toBeNull();
  });
});

describe("Estimate step", () => {
  it("is headed 'Estimate', with Capabilities, the specialist tracker, then Build The Estimate, in that order", () => {
    render(<EstimateStep {...estimateProps()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Estimate" })).toBeInTheDocument();
    const tracker = screen.getByRole("region", { name: "Specialist input" });
    const build = screen.getByRole("region", { name: "Build The Estimate" });
    expect(tracker.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Capability Feedback/)).toBeNull();
  });

  it("shows one specialist row per confirmed capability, with the received count", () => {
    render(<EstimateStep {...estimateProps()} />);
    const tracker = screen.getByRole("region", { name: "Specialist input" });
    expect(tracker).toHaveTextContent("2 of 3 specialist inputs received");
    expect(within(tracker).getAllByRole("combobox")).toHaveLength(3);
  });

  it("has no readiness list; the prerequisite note covers the missing scope confirmation", () => {
    render(<EstimateStep {...estimateProps()} />);
    expect(screen.queryByText("Before you move on")).toBeNull();
    expect(screen.queryByText("At least one capability confirmed")).toBeNull();
    expect(
      screen.getByText("The estimate is built from the confirmed scope. Confirm the scope in Brief first.")
    ).toBeInTheDocument();
  });

  it("explains the prerequisite and disables + New estimate until the scope is confirmed", () => {
    const { rerender } = render(<EstimateStep {...estimateProps()} />);
    const note =
      "The estimate is built from the confirmed scope. Confirm the scope in Brief first.";
    // Shown once, and it describes the disabled main action.
    expect(screen.getAllByText(note)).toHaveLength(1);
    const button = screen.getByRole("button", { name: "+ New estimate" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(note);

    rerender(<EstimateStep {...estimateProps({ scopeConfirmed: true })} />);
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.getByRole("button", { name: "+ New estimate" })).not.toHaveAttribute(
      "aria-disabled"
    );
  });
});

describe("Statement of Work step", () => {
  it("is headed 'Statement of Work' and has no delivery setup content", () => {
    render(<SowStep {...sowProps()} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Statement of Work" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Planning & Capability Briefing/)).toBeNull();
    expect(screen.queryByText(/Delivery Monitoring/)).toBeNull();
    expect(screen.queryByText(/Commercials & SOW/)).toBeNull();
  });

  it("explains the prerequisite and disables Generate SOW until the estimate is approved", () => {
    const { rerender } = render(<SowStep {...sowProps()} />);
    const note = "The SOW is generated from the approved estimate. Approve the estimate first.";
    expect(screen.getAllByText(note)).toHaveLength(1);
    const button = screen.getByRole("button", { name: "Generate SOW" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(note);

    rerender(<SowStep {...sowProps({ estimateApproved: true })} />);
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.getByRole("button", { name: "Generate SOW" })).not.toHaveAttribute(
      "aria-disabled"
    );
  });

  it("has no readiness list; the prerequisite note covers the unapproved estimate", () => {
    render(<SowStep {...sowProps()} />);
    expect(screen.queryByText("Before you move on")).toBeNull();
    expect(screen.queryByText("SOW generated from the approved estimate")).toBeNull();
    expect(
      screen.getByText("The SOW is generated from the approved estimate. Approve the estimate first.")
    ).toBeInTheDocument();
  });
});

describe("project complete", () => {
  it("makes every step read-only: specialist rows, key details and capabilities", () => {
    render(
      <>
        <BriefStep
          {...briefProps({
            ...common(true),
            scopeConfirmedAt: "2026-11-03T10:00:00Z",
            estimateApproved: true,
          })}
        />
        <EstimateStep {...estimateProps({ ...common(true), scopeConfirmed: true })} />
        <SowStep
          {...sowProps({
            ...common(true),
            estimateApproved: true,
            // FB-005's lock is what a complete project has on its SOW.
            sowLock: { versionNumber: 2, clientApprovedOn: "2026-10-22" },
          })}
        />
      </>
    );
    expect(screen.getAllByText(/This project is complete/).length).toBeGreaterThanOrEqual(3);
    for (const box of screen.queryAllByRole("checkbox")) expect(box).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) {
      // Disabled, or inert under FB-005's SOW lock (aria-disabled keeps it focusable and explained).
      expect(
        select.hasAttribute("disabled") || select.getAttribute("aria-disabled") === "true"
      ).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Reopen scope" })).toBeDisabled();
    for (const fieldset of document.querySelectorAll("fieldset")) expect(fieldset).toBeDisabled();
  });
});
