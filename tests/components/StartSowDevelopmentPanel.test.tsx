// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const startSowDevelopmentAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  startSowDevelopmentAction,
}));

const { StartSowDevelopmentPanel } = await import(
  "@/components/features/StartSowDevelopmentPanel"
);

const templateOptions = [
  { id: "sow_baseline", name: "Standard SOW Template", isBaseline: true },
  { id: "sow_variant", name: "Acme-specific SOW", isBaseline: false },
];

describe("StartSowDevelopmentPanel", () => {
  it("shows a disabled placeholder 'Generate SOW' button — the generation agent isn't built yet", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        templateOptions={templateOptions}
      />
    );

    expect(screen.getByRole("button", { name: "Generate SOW" })).toBeDisabled();
  });

  it("lists the baseline and any client-specific variant, labeling the baseline", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        templateOptions={templateOptions}
      />
    );

    expect(
      screen.getByRole("option", { name: "Standard SOW Template (baseline)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme-specific SOW" })).toBeInTheDocument();
  });

  it("shows 'Start SOW development' when no template is selected yet", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        templateOptions={templateOptions}
      />
    );

    expect(screen.getByRole("button", { name: "Start SOW development" })).toBeInTheDocument();
  });

  it("shows the current selection and 'Change SOW Template' once one is set", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        templateOptions={templateOptions}
      />
    );

    expect(screen.getByText("Standard SOW Template")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change SOW Template" })).toBeInTheDocument();
  });

  it("submits the selected template id via startSowDevelopmentAction", async () => {
    const user = userEvent.setup();
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        templateOptions={templateOptions}
      />
    );

    await user.selectOptions(screen.getByLabelText("SOW Template"), "sow_variant");
    await user.click(screen.getByRole("button", { name: "Start SOW development" }));

    expect(startSowDevelopmentAction).toHaveBeenCalled();
  });
});
