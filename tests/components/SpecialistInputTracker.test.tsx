// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSpecialistRows } from "@/lib/project/readiness";

const { updateSpecialistInputAction } =
  await import("@/app/(dashboard)/projects/[projectId]/step-actions");
const { SpecialistInputTracker } = await import("@/components/features/SpecialistInputTracker");
const update = updateSpecialistInputAction as ReturnType<typeof vi.fn>;

const rows = buildSpecialistRows(
  ["EXPERIENCE_DESIGN", "TECH_AND_DATA", "BUSINESS_ARCHITECTURE"],
  [
    { capability: "EXPERIENCE_DESIGN", status: "received", note: "From Sam" },
    { capability: "TECH_AND_DATA", status: "received", note: null },
  ]
);

describe("SpecialistInputTracker", () => {
  it("shows one row per confirmed capability and the received count", () => {
    render(<SpecialistInputTracker projectId="p1" rows={rows} />);
    expect(screen.getByText("2 of 3 specialist inputs received")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByLabelText(`Note for ${rows[0].label}`)).toHaveValue("From Sam");
    expect(screen.getByLabelText(`Status for ${rows[2].label}`)).toHaveValue("not_requested");
  });

  it("sets a row's status by hand", async () => {
    const user = userEvent.setup();
    render(<SpecialistInputTracker projectId="p1" rows={rows} />);
    await user.selectOptions(screen.getByLabelText(`Status for ${rows[2].label}`), "requested");
    expect(update).toHaveBeenCalledWith({
      projectId: "p1",
      capability: "BUSINESS_ARCHITECTURE",
      status: "requested",
      note: "",
    });
  });

  it("saves a changed note on blur", async () => {
    const user = userEvent.setup();
    update.mockClear();
    render(<SpecialistInputTracker projectId="p1" rows={rows} />);
    await user.type(screen.getByLabelText(`Note for ${rows[1].label}`), "Via Teams");
    await user.tab();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "TECH_AND_DATA", note: "Via Teams" })
    );
  });

  it("asks for capabilities when none are confirmed", () => {
    render(<SpecialistInputTracker projectId="p1" rows={[]} />);
    expect(screen.getByText(/Confirm the capabilities this project needs/)).toBeInTheDocument();
  });

  it("is read-only once the project is complete", () => {
    render(<SpecialistInputTracker projectId="p1" rows={rows} readOnly />);
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
    expect(screen.getByLabelText(`Note for ${rows[0].label}`)).toHaveAttribute("readonly");
  });
});
