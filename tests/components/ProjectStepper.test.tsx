// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProjectStepper } from "@/components/features/ProjectStepper";
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

  it("shows each step's status as text, and aria-current on the active one only", () => {
    render(
      <ProjectStepper projectId="p1" statuses={notStarted} summaries={{}} activeStepId="estimate" />
    );
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getAllByText("Not started")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Estimate, not started" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Brief, in progress" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("shows done summaries instead of status text, with spoken accessible names", () => {
    render(
      <ProjectStepper projectId="p1" statuses={allDone} summaries={summaries} activeStepId="sow" />
    );
    expect(screen.getByText("Scope confirmed · 3 Nov")).toBeInTheDocument();
    expect(screen.getByText("Approved 18 Oct · 45,675.00 USD")).toBeInTheDocument();
    expect(screen.getByText("Approved 22 Oct · v2")).toBeInTheDocument();
    expect(screen.queryByText("Done")).toBeNull();
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
