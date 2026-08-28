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
  {
    id: "sow_baseline",
    name: "Standard SOW Template",
    isBaseline: true,
    versions: [
      { id: "sow_baseline_v1", versionNumber: 1, fileName: "baseline-v1.docx", status: "ENABLED" as const },
    ],
  },
  {
    id: "sow_variant",
    name: "Acme-specific SOW",
    isBaseline: false,
    versions: [
      { id: "sow_variant_v2", versionNumber: 2, fileName: "acme-v2.docx", status: "DISABLED" as const },
      { id: "sow_variant_v1", versionNumber: 1, fileName: "acme-v1.docx", status: "ENABLED" as const },
    ],
  },
];

describe("StartSowDevelopmentPanel", () => {
  it("shows a disabled placeholder 'Generate SOW' button — the generation agent isn't built yet", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
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
        currentTemplateVersion={null}
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
        currentTemplateVersion={null}
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
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
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
        currentTemplateVersion={null}
        templateOptions={templateOptions}
      />
    );

    await user.selectOptions(screen.getByLabelText("SOW Template"), "sow_variant");
    await user.click(screen.getByRole("button", { name: "Start SOW development" }));

    expect(startSowDevelopmentAction).toHaveBeenCalled();
  });

  it("presents a version select, pre-selecting the version flagged current, once a template is chosen (phase 3: Rule 2 audit gap fix)", async () => {
    const user = userEvent.setup();
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
      />
    );

    await user.selectOptions(screen.getByLabelText("SOW Template"), "sow_variant");

    const versionSelect = screen.getByLabelText("Version");
    expect(versionSelect).toHaveValue("sow_variant_v1");
    expect(screen.getByRole("option", { name: "Version 1 — acme-v1.docx (current)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Version 2 — acme-v2.docx" })).toBeInTheDocument();
  });

  it("pre-selects the Project's own recorded version, not just whichever is flagged current, when it still belongs to that template", () => {
    render(
      <StartSowDevelopmentPanel
        projectId="proj_1"
        currentTemplate={{ id: "sow_variant", name: "Acme-specific SOW" }}
        currentTemplateVersion={{ id: "sow_variant_v2" }}
        templateOptions={templateOptions}
      />
    );

    expect(screen.getByLabelText("Version")).toHaveValue("sow_variant_v2");
  });
});
