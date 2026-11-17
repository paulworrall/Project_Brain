// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
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
const { allOpen } = await import("../fixtures/subTasks");

// FB-012: the Next step banner holds the page's one primary action. Nothing inside
// a step's content (all sub-tasks open, so every control is on the page) is a
// second primary button — only a dialog's or an open form's own submit may be.

function primaries(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button, a"))
    .filter((el) => /\bbg-primary\b(?!\/)/.test(el.className))
    .map((el) => el.textContent?.trim() ?? "");
}

const complete = briefCompleteness([briefRecord("budget", { amount: "£50,000", currency: "GBP" })]);
const confirmed: Capability[] = ["EXPERIENCE_DESIGN", "TECH_AND_DATA"];

function brief(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "p1",
    projectComplete: false,
    scopeSummary: null,
    earlierDocuments: { positionDocument: null, draftScopeDocument: null },
    openQuestions: 2,
    missingMsaRateCard: false,
    clientName: "Fizzy",
    subTasks: allOpen("brief"),
    briefCompleteness: complete,
    pmPerspective: pmPerspectiveView(),
    scopeConfirmedAt: null,
    scopeConfirmedByName: null,
    estimateApproved: false,
    ...overrides,
  };
}

function estimate(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "p1",
    projectComplete: false,
    subTasks: allOpen("estimate"),
    scopeConfirmed: true,
    confirmedCapabilities: confirmed,
    estimateBriefVersion: null,
    specialistRows: buildSpecialistRows(confirmed, []),
    estimates: [],
    rateCardOptions: [],
    estimateLock: null,
    approvalPermissions: { canApprove: true, canRevert: false },
    ...overrides,
  };
}

function sow(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "p1",
    projectComplete: false,
    subTasks: allOpen("sow"),
    estimateApproved: true,
    currentSowTemplate: { id: "t1", name: "Standard SOW Template" },
    currentSowTemplateVersion: { id: "tv1" },
    sowTemplateOptions: [],
    sowVersions: [],
    briefCompleteness: complete,
    sowLock: null,
    approvalPermissions: { canApprove: true, canRevert: false },
    ...overrides,
  };
}

describe("no duplicate primary actions (FB-012)", () => {
  it("Brief: a new project with no scope summary", () => {
    const { container } = render(<BriefStep {...brief()} />);
    expect(primaries(container)).toEqual([]);
  });

  it("Brief: scope confirmed", () => {
    const { container } = render(
      <BriefStep {...brief({ scopeConfirmedAt: "2026-11-03T10:00:00Z", openQuestions: 0 })} />
    );
    expect(primaries(container)).toEqual([]);
  });

  it("Brief: a thin brief's callout points to the open questions with a secondary link", () => {
    const { container } = render(
      <BriefStep {...brief({ briefAssessment: { level: "thin", reasons: ["No budget"] } })} />
    );
    expect(primaries(container)).toEqual([]);
    expect(container.textContent).toContain("See the open questions");
  });

  it("Brief: a complete brief's fast-path link is secondary", () => {
    const { container } = render(
      <BriefStep {...brief({ briefAssessment: { level: "complete", reasons: [] } })} />
    );
    expect(primaries(container)).toEqual([]);
  });

  it("Estimate: scope confirmed, nothing built yet", () => {
    const { container } = render(<EstimateStep {...estimate()} />);
    expect(primaries(container)).toEqual([]);
  });

  it("Estimate: scope not confirmed (amber notice shown)", () => {
    const { container } = render(<EstimateStep {...estimate({ scopeConfirmed: false })} />);
    expect(primaries(container)).toEqual([]);
  });

  it("SOW: no SOW yet", () => {
    const { container } = render(<SowStep {...sow()} />);
    expect(primaries(container)).toEqual([]);
  });

  it("SOW: estimate not approved (amber notice shown)", () => {
    const { container } = render(<SowStep {...sow({ estimateApproved: false })} />);
    expect(primaries(container)).toEqual([]);
  });

  it("SOW: a generated version awaiting approval", () => {
    const { container } = render(
      <SowStep
        {...sow({
          sowVersions: [
            {
              id: "s1",
              versionNumber: 1,
              createdAt: new Date("2026-10-20T10:00:00Z"),
              approvalState: "draft",
              sourceEstimateVersionNumber: 1,
              total: 45675,
              currency: "USD",
            },
          ],
        })}
      />
    );
    // "Mark as client approved" opens a dialog; the button itself is secondary.
    expect(primaries(container)).toEqual([]);
  });
});
