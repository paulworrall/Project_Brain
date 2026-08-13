// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateProjectSummaryAction: vi.fn(),
}));

const { ProjectSummaryBar } = await import("@/components/features/ProjectSummaryBar");

describe("ProjectSummaryBar", () => {
  it("shows 'Not yet set' fallbacks when no summary details exist", () => {
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="ACTIVE"
        jobCode={null}
        kickOffDate={null}
        targetCompletionDate={null}
        projectManager={null}
        projectManagerOptions={[]}
        rateCard={null}
        rateCardOptions={[]}
      />
    );

    expect(screen.getAllByText("Not yet set")).toHaveLength(5);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders real summary details when set, including the Rate Card", () => {
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="COMPLETE"
        jobCode="FIZ-2026-014"
        kickOffDate={new Date("2026-06-01")}
        targetCompletionDate={new Date("2026-09-15")}
        projectManager={{ id: "u1", name: "Priya Mehta" }}
        projectManagerOptions={[{ id: "u1", name: "Priya Mehta" }]}
        rateCard={{ id: "rc_1", name: "2026 Standard Rates", currency: "GBP" }}
        rateCardOptions={[{ id: "rc_1", name: "2026 Standard Rates", currency: "GBP" }]}
      />
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("FIZ-2026-014")).toBeInTheDocument();
    expect(screen.getByText("Priya Mehta")).toBeInTheDocument();
    expect(screen.getByText("2026 Standard Rates (GBP)")).toBeInTheDocument();
  });

  it("switches to an editable form with pre-filled values when Edit is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="ACTIVE"
        jobCode="FIZ-2026-014"
        kickOffDate={null}
        targetCompletionDate={null}
        projectManager={null}
        projectManagerOptions={[{ id: "u1", name: "Priya Mehta" }]}
        rateCard={null}
        rateCardOptions={[{ id: "rc_1", name: "2026 Standard Rates", currency: "GBP" }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Job Code")).toHaveValue("FIZ-2026-014");
    expect(screen.getByLabelText("Rate Card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("returns to view mode without saving when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="ACTIVE"
        jobCode="FIZ-2026-014"
        kickOffDate={null}
        targetCompletionDate={null}
        projectManager={null}
        projectManagerOptions={[]}
        rateCard={null}
        rateCardOptions={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Job Code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
