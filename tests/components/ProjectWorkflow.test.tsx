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
const { allOpen, subTasksFor } = await import("../fixtures/subTasks");

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
    subTasks: allOpen("brief"),
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
    subTasks: allOpen("estimate"),
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
    subTasks: allOpen("sow"),
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

  it("lists its sub-tasks in order: 1 Key details, 2 Scope summary, 3 Confirm scope", () => {
    render(<BriefStep {...briefProps()} />);
    const groups = Array.from(document.querySelectorAll("[data-subtask]")).map((g) =>
      g.getAttribute("data-subtask")
    );
    expect(groups).toEqual(["brief.key-details", "brief.scope-summary", "brief.confirm-scope"]);
    const numbers = groups.map((id) => document.querySelector(`[data-subtask="${id}"] button span`)?.textContent);
    expect(numbers).toEqual(["1", "2", "3"]);
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
  it("is headed 'Estimate', with its five sub-tasks in order: teams, brief, specialist inputs, build, approval", () => {
    render(<EstimateStep {...estimateProps()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Estimate" })).toBeInTheDocument();
    const tracker = screen.getByRole("group", { name: "Specialist inputs" });
    const build = screen.getByRole("group", { name: "Build the estimate" });
    expect(tracker.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Capability Feedback/)).toBeNull();
  });

  it("shows one specialist row per confirmed capability, with the received count", () => {
    render(<EstimateStep {...estimateProps()} />);
    const tracker = screen.getByRole("group", { name: "Specialist inputs" });
    expect(tracker).toHaveTextContent("2 of 3 specialist inputs received");
    expect(within(tracker).getAllByRole("combobox")).toHaveLength(3);
  });

  it("has no readiness list; the prerequisite note covers the missing scope confirmation", () => {
    render(<EstimateStep {...estimateProps()} />);
    expect(screen.queryByText("Before you move on")).toBeNull();
    expect(screen.queryByText("At least one capability confirmed")).toBeNull();
    const notice = document.querySelector('[data-prerequisite="estimate"]')!;
    expect(notice).toHaveTextContent("Confirm the scope first. The estimate is built from the confirmed scope.");
    // An amber notice with a lock icon and one secondary link to where to fix it.
    expect(notice.querySelector("svg")).not.toBeNull();
    expect(within(notice as HTMLElement).getByRole("link", { name: "Go to Brief" })).toHaveAttribute(
      "href",
      "/projects/p1/brief"
    );
  });

  it("explains the prerequisite and disables New estimate until the scope is confirmed", () => {
    const { rerender } = render(<EstimateStep {...estimateProps()} />);
    const note =
      "Confirm the scope first. The estimate is built from the confirmed scope.";
    // Shown once, and it describes the disabled main action.
    expect(document.querySelectorAll('[data-prerequisite="estimate"]')).toHaveLength(1);
    const button = screen.getByRole("button", { name: "New estimate" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(note);

    rerender(<EstimateStep {...estimateProps({ scopeConfirmed: true })} />);
    expect(document.querySelector('[data-prerequisite="estimate"]')).toBeNull();
    expect(screen.getByRole("button", { name: "New estimate" })).not.toHaveAttribute(
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
    const note = "Approve the estimate first. The SOW is generated from the approved estimate.";
    expect(document.querySelectorAll('[data-prerequisite="sow"]')).toHaveLength(1);
    const button = screen.getByRole("button", { name: "Generate SOW" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(note);

    rerender(<SowStep {...sowProps({ estimateApproved: true })} />);
    expect(document.querySelector('[data-prerequisite="sow"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Generate SOW" })).not.toHaveAttribute(
      "aria-disabled"
    );
  });

  it("has no readiness list; the prerequisite note covers the unapproved estimate", () => {
    render(<SowStep {...sowProps()} />);
    expect(screen.queryByText("Before you move on")).toBeNull();
    expect(screen.queryByText("SOW generated from the approved estimate")).toBeNull();
    const notice = document.querySelector('[data-prerequisite="sow"]')!;
    expect(notice).toHaveTextContent("Approve the estimate first. The SOW is generated from the approved estimate.");
    expect(within(notice as HTMLElement).getByRole("link", { name: "Go to Estimate" })).toHaveAttribute(
      "href",
      "/projects/p1/estimate"
    );
  });
});

describe("project complete (FB-012)", () => {
  const approvedSow = {
    id: "s2",
    versionNumber: 2,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    approvalState: "approved" as const,
    approval: {
      id: "a1",
      clientApprovedOn: "2026-10-22",
      clientApproverName: "Caroline",
      reference: null,
      recordedBy: { id: "u1", name: "Pat" },
      recordedAt: "2026-10-22T10:00:00Z",
    },
    sourceEstimateVersionNumber: 3,
    total: 45675,
    currency: "USD",
  };
  const earlierSow = {
    id: "s1",
    versionNumber: 1,
    createdAt: new Date("2026-10-10T10:00:00Z"),
    approvalState: "superseded" as const,
  };

  function completeProps() {
    return {
      brief: briefProps({
        ...common(true),
        scopeConfirmedAt: "2026-11-03T10:00:00Z",
        estimateApproved: true,
      }),
      estimate: estimateProps({ ...common(true), scopeConfirmed: true }),
      sow: sowProps({
        ...common(true),
        estimateApproved: true,
        sowVersions: [approvedSow, earlierSow],
        sowLock: { versionNumber: 2, clientApprovedOn: "2026-10-22" },
      }),
    };
  }

  it("makes every step read-only, and says 'project complete' nowhere in the steps", () => {
    const props = completeProps();
    render(
      <>
        <BriefStep {...props.brief} />
        <EstimateStep {...props.estimate} />
        <SowStep {...props.sow} />
      </>
    );
    // The one lock line lives under the stepper (NextStepBanner), not repeated here.
    expect(screen.queryByText(/This project is complete/)).toBeNull();
    expect(screen.queryByText(/change request/i)).toBeNull();
    for (const box of screen.queryAllByRole("checkbox")) expect(box).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) {
      expect(
        select.hasAttribute("disabled") || select.getAttribute("aria-disabled") === "true"
      ).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Reopen scope" })).toBeDisabled();
    for (const fieldset of document.querySelectorAll("fieldset")) expect(fieldset).toBeDisabled();
  });

  it("the SOW step shows a compact approved version and a collapsed history, with no selectors or Regenerate", () => {
    render(<SowStep {...completeProps().sow} />);
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Document status: Client approved/ })).toBeInTheDocument();
    expect(screen.getByText(/Approved by Caroline on 22 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download .docx" })).toHaveAttribute(
      "href",
      "/api/projects/p1/sow/s2"
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Regenerate SOW|Generate SOW|Change template/ })).toBeNull();
    expect(screen.queryByText("SOW Template")).toBeNull();
    const history = screen.getByText("Project history").closest("details")!;
    expect(history).not.toHaveAttribute("open");
    expect(history).toHaveTextContent("Version 1");
  });

  it("other steps of a complete project show their sub-tasks collapsed", () => {
    const props = completeProps();
    render(<EstimateStep {...estimateProps({ ...common(true), scopeConfirmed: true, subTasks: subTasksFor("estimate", { projectComplete: true, sowApproved: true }) })} />);
    for (const header of screen.getAllByRole("button", { name: /Choose teams|Estimate brief|Specialist inputs|Build the estimate|Client approval/ })) {
      expect(header).toHaveAttribute("aria-expanded", "false");
    }
    expect(props).toBeDefined();
  });
});
