// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WorkstreamProjectsTable,
  type WorkstreamProjectRow,
} from "@/components/features/WorkstreamProjectsTable";

const stageOptions = [
  { number: 1, name: "Intake" },
  { number: 4, name: "Triage" },
];

const projects: WorkstreamProjectRow[] = [
  {
    id: "proj_a",
    name: "Zebra Refresh",
    currentStageNumber: 1,
    stageName: "Intake",
    jobCode: "ZBR-001",
    targetCompletionDate: new Date("2026-09-01"),
    projectManagerName: "Priya Mehta",
    updatedAt: new Date("2026-08-01"),
  },
  {
    id: "proj_b",
    name: "Alpha Launch",
    currentStageNumber: 4,
    stageName: "Triage",
    jobCode: null,
    targetCompletionDate: null,
    projectManagerName: null,
    updatedAt: new Date("2026-08-05"),
  },
];

describe("WorkstreamProjectsTable", () => {
  it("shows an empty state when there are no projects at all", () => {
    render(<WorkstreamProjectsTable projects={[]} stageOptions={stageOptions} />);

    expect(screen.getByText("No projects yet in this Workstream.")).toBeInTheDocument();
  });

  it("lists every project with its stage, PM, and dates", () => {
    render(<WorkstreamProjectsTable projects={projects} stageOptions={stageOptions} />);

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    const alphaRow = rows.find((row) => within(row).queryByText("Alpha Launch"));
    expect(alphaRow).toBeDefined();
    expect(within(alphaRow!).getByText(/Stage\s*4\s*—\s*Triage/)).toBeInTheDocument();

    const zebraRow = rows.find((row) => within(row).queryByText("Zebra Refresh"));
    expect(zebraRow).toBeDefined();
    expect(within(zebraRow!).getByText("Priya Mehta")).toBeInTheDocument();
  });

  it("filters by search term across name and job code", async () => {
    const user = userEvent.setup();
    render(<WorkstreamProjectsTable projects={projects} stageOptions={stageOptions} />);

    await user.type(screen.getByLabelText("Search projects"), "ZBR");

    expect(screen.getByText("Zebra Refresh")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Launch")).not.toBeInTheDocument();
  });

  it("shows a no-results message when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(<WorkstreamProjectsTable projects={projects} stageOptions={stageOptions} />);

    await user.type(screen.getByLabelText("Search projects"), "nonexistent");

    expect(screen.getByText("No projects match your search.")).toBeInTheDocument();
  });

  it("filters by stage", async () => {
    const user = userEvent.setup();
    render(<WorkstreamProjectsTable projects={projects} stageOptions={stageOptions} />);

    await user.selectOptions(screen.getByLabelText("Filter by stage"), "4");

    expect(screen.getByText("Alpha Launch")).toBeInTheDocument();
    expect(screen.queryByText("Zebra Refresh")).not.toBeInTheDocument();
  });

  it("sorts by project name when the column header is clicked", async () => {
    const user = userEvent.setup();
    render(<WorkstreamProjectsTable projects={projects} stageOptions={stageOptions} />);

    await user.click(screen.getByRole("button", { name: /Project/ }));

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(within(rows[0]).getByText("Alpha Launch")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Zebra Refresh")).toBeInTheDocument();
  });
});
