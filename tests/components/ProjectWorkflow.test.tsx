// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Capability } from "@/generated/prisma/enums";
import type { ChecklistItemView } from "@/components/features/ChecklistView";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateChecklistItemDetailAction: vi.fn(),
  updateOtherServiceLabelAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
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
const { buildSpecialistRows, buildSystemChecks } = await import("@/lib/project/readiness");
const { briefCompleteness, briefRecord } = await import("../fixtures/briefCompleteness");
const { pmPerspectiveView } = await import("../fixtures/pmPerspective");

const checks = buildSystemChecks({
  briefSubmitted: true,
  hasMasterServiceAgreement: false,
  hasRateCard: true,
  scopeConfirmed: false,
  confirmedCapabilityCount: 0,
  estimateApproved: false,
  sowFromApprovedEstimate: false,
});

const items: ChecklistItemView[] = [
  { id: "c1", label: "Assign job code", isComplete: false, detailText: null, step: "brief" },
  // Existing items have no step yet: they default to Brief.
  { id: "c2", label: "Create Teams channel", isComplete: true, detailText: null },
  {
    id: "c3",
    label: "Book estimation session",
    isComplete: false,
    detailText: null,
    step: "estimate",
  },
  { id: "c4", label: "Send SOW to procurement", isComplete: false, detailText: null, step: "sow" },
];

function common(projectComplete = false) {
  return { projectId: "p1", checklistItems: items, projectComplete };
}

function briefProps(overrides: Partial<Parameters<typeof BriefStep>[0]> = {}) {
  return {
    ...common(),
    systemChecks: checks.brief,
    scopeSummary: null,
    earlierDocuments: { positionDocument: null, draftScopeDocument: null },
    openQuestions: 2,
    clarificationSentAt: null,
    clientUpdates: [],
    clarificationEmail: { subject: "Quick questions", bodyText: "Hi," },
    clarificationEmailDraft: null,
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
    systemChecks: checks.estimate,
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
    systemChecks: checks.sow,
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

function readiness() {
  return screen.getByRole("region", { name: "Before you move on" });
}

describe("Brief step", () => {
  it("is headed 'Brief' and shows only Brief readiness items, defaulting existing items to Brief", () => {
    render(<BriefStep {...briefProps()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Brief" })).toBeInTheDocument();
    const list = readiness();
    expect(within(list).getByRole("checkbox", { name: "Assign job code" })).toBeInTheDocument();
    expect(
      within(list).getByRole("checkbox", { name: "Create Teams channel" })
    ).toBeInTheDocument();
    expect(within(list).queryByRole("checkbox", { name: "Book estimation session" })).toBeNull();
    expect(within(list).queryByRole("checkbox", { name: "Send SOW to procurement" })).toBeNull();
  });

  it("shows the Brief system checks read-only, in words", () => {
    render(<BriefStep {...briefProps()} />);
    const auto = within(readiness()).getByRole("list", { name: "Automatic checks" });
    expect(auto).toHaveTextContent("Brief submitted");
    expect(auto).toHaveTextContent("MSA and rate card set on the project");
    expect(within(auto).queryByRole("checkbox")).toBeNull();
    expect(auto).toHaveTextContent("Not yet");
  });

  it("keeps the Clarification Email and Position Document, and ends with the confirm-scope gate", () => {
    render(<BriefStep {...briefProps()} />);
    expect(screen.getByRole("region", { name: "Scope summary" })).toBeInTheDocument();
    expect(screen.getByText(/Quick questions/)).toBeInTheDocument();
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

  it("shows only Estimate readiness items and its system checks", () => {
    render(<EstimateStep {...estimateProps()} />);
    const list = readiness();
    expect(
      within(list).getByRole("checkbox", { name: "Book estimation session" })
    ).toBeInTheDocument();
    expect(within(list).queryByRole("checkbox", { name: "Assign job code" })).toBeNull();
    expect(list).toHaveTextContent("Scope confirmed");
    expect(list).toHaveTextContent("At least one capability confirmed");
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

  it("shows only SOW readiness items and its system checks", () => {
    render(<SowStep {...sowProps()} />);
    const list = readiness();
    expect(
      within(list).getByRole("checkbox", { name: "Send SOW to procurement" })
    ).toBeInTheDocument();
    expect(list).toHaveTextContent("Estimate approved");
    expect(list).toHaveTextContent("SOW generated from the approved estimate");
  });
});

describe("project complete", () => {
  it("makes every step read-only: checklist, specialist rows, key details and capabilities", () => {
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
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) {
      // Disabled, or inert under FB-005's SOW lock (aria-disabled keeps it focusable and explained).
      expect(
        select.hasAttribute("disabled") || select.getAttribute("aria-disabled") === "true"
      ).toBe(true);
    }
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reopen scope" })).toBeDisabled();
    for (const fieldset of document.querySelectorAll("fieldset")) expect(fieldset).toBeDisabled();
  });
});
