// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProjectStepper, stepStatusLine } from "@/components/features/ProjectStepper";
import { buildStepSummaries, deriveStepStatuses } from "@/lib/projectSteps";

const notStarted = deriveStepStatuses({
  scopeConfirmedAt: null,
  hasApprovedEstimate: false,
  hasEstimateWork: false,
  hasApprovedSow: false,
  hasSowVersion: false,
});

const allDone = deriveStepStatuses({
  scopeConfirmedAt: "2026-11-03T10:00:00Z",
  hasApprovedEstimate: true,
  hasEstimateWork: true,
  hasApprovedSow: true,
  hasSowVersion: true,
});

const summaries = buildStepSummaries({
  scopeConfirmedAt: "2026-11-03T10:00:00Z",
  approvedEstimate: {
    clientApprovedOn: "2026-10-18",
    total: 45675,
    currency: "USD",
    downloadHref: "/api/projects/p1/estimates/e1/versions/v3",
    versionNumber: 3,
  },
  approvedSow: {
    clientApprovedOn: "2026-10-22",
    versionNumber: 2,
    downloadHref: "/api/projects/p1/sow/s2",
  },
});

describe("ProjectStepper", () => {
  it("renders three numbered steps in a labelled nav, linking to their step URLs", () => {
    render(
      <ProjectStepper projectId="p1" statuses={notStarted} summaries={{}} activeStepId="brief" />
    );
    const nav = screen.getByRole("navigation", { name: "Project steps" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/projects/p1/brief",
      "/projects/p1/estimate",
      "/projects/p1/sow",
    ]);
    expect(within(nav).getByText("1")).toBeInTheDocument();
    expect(within(nav).getByText("3")).toBeInTheDocument();
  });

  it("shows each step's status as icon + text: You are here, In progress, Up next, Not started", () => {
    // Brief in progress (not shown), Estimate shown (not started, the next step to do... after Brief).
    render(
      <ProjectStepper projectId="p1" statuses={notStarted} summaries={{}} activeStepId="estimate" />
    );
    expect(screen.getByText("In progress")).toBeInTheDocument(); // Brief, not the step shown
    expect(screen.getByText("You are here")).toBeInTheDocument(); // Estimate, the step shown
    expect(screen.getByText("Not started")).toBeInTheDocument(); // SOW
    expect(screen.getByRole("link", { name: "Estimate, not started" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Brief, in progress" })).not.toHaveAttribute(
      "aria-current"
    );
    // Never colour alone: every status line carries an icon.
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });

  it("calls the next step to do 'Up next' when another step is shown", () => {
    const briefDone = deriveStepStatuses({
      scopeConfirmedAt: "2026-11-03T10:00:00Z",
      hasApprovedEstimate: false,
      hasEstimateWork: false,
      hasApprovedSow: false,
      hasSowVersion: false,
    });
    render(
      <ProjectStepper
        projectId="p1"
        statuses={briefDone}
        summaries={buildStepSummaries({
          scopeConfirmedAt: "2026-11-03T10:00:00Z",
          approvedEstimate: null,
          approvedSow: null,
        })}
        activeStepId="brief"
      />
    );
    expect(screen.getByText("Up next")).toBeInTheDocument(); // Estimate
    expect(screen.getByText("Not started")).toBeInTheDocument(); // SOW
    expect(screen.getByText(/Scope confirmed · 3 Nov/)).toBeInTheDocument();
  });

  it("flags a step that needs review with a warning icon and the words 'Needs review'", () => {
    render(
      <ProjectStepper
        projectId="p1"
        statuses={allDone}
        summaries={summaries}
        activeStepId="sow"
        attention={{ estimate: "Updated since the estimate was saved" }}
      />
    );
    const link = screen.getByRole("link", { name: /^Estimate, done.*needs attention/ });
    expect(link).toHaveTextContent("Needs review");
    expect(link.querySelector('[data-state="needs_review"], svg')).not.toBeNull();
  });

  it("stepStatusLine picks the right words and badge states", () => {
    const base = { isActive: false, isNext: false } as const;
    expect(stepStatusLine({ ...base, status: "done", summary: { text: "Approved 19 Oct · v2", spoken: "" } })).toEqual({
      state: "done",
      text: "Approved 19 Oct · v2",
    });
    expect(stepStatusLine({ ...base, status: "in_progress", isActive: true })).toEqual({
      state: "in_progress",
      text: "You are here",
    });
    expect(stepStatusLine({ ...base, status: "not_started", isNext: true })).toEqual({
      state: "not_started",
      text: "Up next",
    });
    expect(stepStatusLine({ ...base, status: "not_started" })).toEqual({
      state: "not_started",
      text: "Not started",
    });
    expect(stepStatusLine({ ...base, status: "done", attention: "x" }).state).toBe("needs_review");
  });

  it("shows done summaries instead of status text, with spoken accessible names", () => {
    render(
      <ProjectStepper projectId="p1" statuses={allDone} summaries={summaries} activeStepId="sow" />
    );
    expect(screen.getByText("Scope confirmed · 3 Nov")).toBeInTheDocument();
    expect(screen.getByText("Approved 18 Oct · 45,675.00 USD")).toBeInTheDocument();
    expect(screen.getByText("Approved 22 Oct · v2")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Estimate, done, approved 18 October, 45,675.00 US dollars",
      })
    ).toBeInTheDocument();
  });

  it("offers the approved estimate and SOW files as separate download links", () => {
    render(
      <ProjectStepper projectId="p1" statuses={allDone} summaries={summaries} activeStepId="sow" />
    );
    expect(screen.getByRole("link", { name: "Download approved estimate v3" })).toHaveAttribute(
      "href",
      "/api/projects/p1/estimates/e1/versions/v3"
    );
    expect(screen.getByRole("link", { name: "Download approved SOW v2" })).toHaveAttribute(
      "href",
      "/api/projects/p1/sow/s2"
    );
  });
});
