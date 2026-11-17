// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateProjectSummaryAction: vi.fn(),
}));

const { ProjectSummaryBar } = await import("@/components/features/ProjectSummaryBar");

describe("ProjectSummaryBar", () => {
  it("collapses unset fields into one 'details missing' link instead of showing 'Not yet set' (FB-012)", () => {
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

    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
    expect(screen.queryByText("Job #")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 details missing · Add" })).toBeInTheDocument();
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

    expect(screen.getByRole("img", { name: "Status: Complete" })).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Job #")).toBeInTheDocument();
    // Everything is set: nothing is missing, so the link just says Edit.
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByText(/details? missing/)).not.toBeInTheDocument();
    expect(screen.getByText("FIZ-2026-014")).toBeInTheDocument();
    expect(screen.getByText("Priya Mehta")).toBeInTheDocument();
    expect(screen.getByText("2026 Standard Rates (GBP)")).toBeInTheDocument();
  });

  it("omits the '(currency)' suffix entirely for a Rate Card with no currency set", () => {
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="ACTIVE"
        jobCode={null}
        kickOffDate={null}
        targetCompletionDate={null}
        projectManager={null}
        projectManagerOptions={[]}
        rateCard={{ id: "rc_1", name: "No Currency Rates", currency: null }}
        rateCardOptions={[{ id: "rc_1", name: "No Currency Rates", currency: null }]}
      />
    );

    expect(screen.getByText("No Currency Rates")).toBeInTheDocument();
    expect(screen.queryByText(/No Currency Rates \(/)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "4 details missing · Add" }));

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

    await user.click(screen.getByRole("button", { name: "4 details missing · Add" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Job Code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 details missing · Add" })).toBeInTheDocument();
  });

  it("the status pill names the step and says In progress; singular 'detail' when one is missing", () => {
    const base = {
      projectId: "proj_1",
      status: "ACTIVE" as const,
      jobCode: "FIZ-1",
      kickOffDate: new Date("2026-06-01"),
      targetCompletionDate: new Date("2026-09-15"),
      projectManager: { id: "u1", name: "Priya Mehta" },
      projectManagerOptions: [],
      rateCard: null,
      rateCardOptions: [],
    };
    const { rerender } = render(<ProjectSummaryBar {...base} currentStepLabel="Estimate" />);
    expect(screen.getByRole("img", { name: "Status: Estimate · In progress" })).toHaveAttribute(
      "data-state",
      "in_progress"
    );
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 detail missing · Add" })).toBeInTheDocument();
    rerender(<ProjectSummaryBar {...base} currentStepLabel="SOW" />);
    expect(screen.getByRole("img", { name: "Status: SOW · In progress" })).toBeInTheDocument();
    rerender(<ProjectSummaryBar {...base} currentStepLabel="Brief" />);
    expect(screen.getByRole("img", { name: "Status: Brief · In progress" })).toBeInTheDocument();
  });

  it("labels are 14px and values 16px", () => {
    render(
      <ProjectSummaryBar
        projectId="proj_1"
        status="ACTIVE"
        jobCode="FIZ-1"
        kickOffDate={null}
        targetCompletionDate={null}
        projectManager={null}
        projectManagerOptions={[]}
        rateCard={null}
        rateCardOptions={[]}
      />
    );
    expect(screen.getByText("Job #").className).toContain("text-xs"); // 14px (meta)
    expect(screen.getByText("FIZ-1").className).toContain("text-sm"); // 16px (body)
  });
});
