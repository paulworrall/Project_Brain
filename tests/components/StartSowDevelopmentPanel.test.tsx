// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const startSowDevelopmentAction = vi.fn(async () => undefined);
const generateSowAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  startSowDevelopmentAction,
  generateSowAction,
  confirmBriefAttributeAction: vi.fn(),
  suggestBriefAttributesAction: vi.fn(),
}));

const { StartSowDevelopmentPanel } = await import(
  "@/components/features/StartSowDevelopmentPanel"
);
const { ALL_REQUIRED_CONFIRMED, briefCompleteness, briefRecord } = await import(
  "../fixtures/briefCompleteness"
);
const COMPLETE = briefCompleteness(ALL_REQUIRED_CONFIRMED);

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
  it("disables 'Generate SOW' until a template is selected", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(screen.getByRole("button", { name: "Generate SOW" })).toBeDisabled();
    expect(screen.getByText("Select a SOW Template above before generating.")).toBeInTheDocument();
  });

  it("enables 'Generate SOW' once a template is selected, and calls generateSowAction on click", async () => {
    const user = userEvent.setup();
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    const generateButton = screen.getByRole("button", { name: "Generate SOW" });
    expect(generateButton).toBeEnabled();

    await user.click(generateButton);
    expect(generateSowAction).toHaveBeenCalled();
  });

  it("shows the latest version + download link, and labels the button 'Regenerate SOW' once one exists", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
        templateOptions={templateOptions}
        sowVersions={[{ id: "sowv_2", versionNumber: 2, createdAt: new Date("2026-09-20T10:00:00Z") }]}
      />
    );

    expect(screen.getByRole("button", { name: "Regenerate SOW" })).toBeInTheDocument();
    expect(screen.getByText(/Version 2 —/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download .docx →" })).toHaveAttribute(
      "href",
      "/api/projects/proj_1/sow/sowv_2"
    );
  });

  it("lists every earlier version in the 'Download a past version' disclosure", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
        templateOptions={templateOptions}
        sowVersions={[
          { id: "sowv_2", versionNumber: 2, createdAt: new Date("2026-09-20T10:00:00Z") },
          { id: "sowv_1", versionNumber: 1, createdAt: new Date("2026-09-10T10:00:00Z") },
        ]}
      />
    );

    expect(screen.getByText("Download a past version (1)")).toBeInTheDocument();
    const pastVersionLink = screen.getByRole("link", { name: "Download →" });
    expect(pastVersionLink).toHaveAttribute("href", "/api/projects/proj_1/sow/sowv_1");
  });

  it("shows 'No SOW generated yet' when no version exists", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(screen.getByText("No SOW generated yet.")).toBeInTheDocument();
  });

  it("lists the baseline and any client-specific variant, labeling the baseline", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(
      screen.getByRole("option", { name: "Standard SOW Template (baseline)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme-specific SOW" })).toBeInTheDocument();
  });

  it("shows 'Select SOW Template' when no template is selected yet", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(screen.getByRole("button", { name: "Select SOW Template" })).toBeInTheDocument();
  });

  it("shows the current selection and 'Change SOW Template' once one is set", () => {
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
        currentTemplateVersion={{ id: "sow_baseline_v1" }}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(screen.getByText("Standard SOW Template")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change SOW Template" })).toBeInTheDocument();
  });

  it("submits the selected template id via startSowDevelopmentAction", async () => {
    const user = userEvent.setup();
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    await user.selectOptions(screen.getByLabelText("SOW Template"), "sow_variant");
    await user.click(screen.getByRole("button", { name: "Select SOW Template" }));

    expect(startSowDevelopmentAction).toHaveBeenCalled();
  });

  it("presents a version select, pre-selecting the version flagged current, once a template is chosen (phase 3: Rule 2 audit gap fix)", async () => {
    const user = userEvent.setup();
    render(
      <StartSowDevelopmentPanel
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={null}
        currentTemplateVersion={null}
        templateOptions={templateOptions}
        sowVersions={[]}
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
        briefCompleteness={COMPLETE}
        projectId="proj_1"
        currentTemplate={{ id: "sow_variant", name: "Acme-specific SOW" }}
        currentTemplateVersion={{ id: "sow_variant_v2" }}
        templateOptions={templateOptions}
        sowVersions={[]}
      />
    );

    expect(screen.getByLabelText("Version")).toHaveValue("sow_variant_v2");
  });

  describe("brief gate", () => {
    const selectedTemplate = { id: "sow_baseline", name: "Standard SOW Template" };

    it("refuses on click when required key details aren't confirmed, listing exactly what's missing — without calling the action", async () => {
      const user = userEvent.setup();
      generateSowAction.mockClear();
      render(
        <StartSowDevelopmentPanel
          briefCompleteness={briefCompleteness([
            ALL_REQUIRED_CONFIRMED[0],
            briefRecord("objective", { objective: "Relaunch" }),
          ])}
          projectId="proj_1"
          currentTemplate={selectedTemplate}
          currentTemplateVersion={{ id: "sow_baseline_v1" }}
          templateOptions={templateOptions}
          sowVersions={[]}
        />
      );

      expect(screen.getByText(/3 required key details still need confirming/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate SOW" }));

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("We can't generate the SOW yet");
      expect(alert).toHaveTextContent("Objective (partial), Timeline and Key Milestones (missing), Client Contact (missing)");
      expect(screen.queryByRole("heading", { name: "Budget" })).not.toBeInTheDocument();
      expect(screen.getByText("Still needed: Success measures (OKRs/KPIs)")).toBeInTheDocument();
      expect(screen.getAllByText("Fill in →")).toHaveLength(2);
      expect(generateSowAction).not.toHaveBeenCalled();
    });

    it("lets the PM fill a missing detail in right from the alert", async () => {
      const user = userEvent.setup();
      render(
        <StartSowDevelopmentPanel
          briefCompleteness={briefCompleteness(ALL_REQUIRED_CONFIRMED.slice(0, 3))}
          projectId="proj_1"
          currentTemplate={selectedTemplate}
          currentTemplateVersion={{ id: "sow_baseline_v1" }}
          templateOptions={templateOptions}
          sowVersions={[]}
        />
      );

      await user.click(screen.getByRole("button", { name: "Generate SOW" }));
      await user.click(screen.getByText("Fill in →"));

      expect(screen.getByLabelText(/^Name/)).toBeVisible();
      expect(screen.getByLabelText(/^Email/)).toBeVisible();
      expect(screen.getByLabelText(/^Role/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Confirm" })).toBeVisible();
    });

    it("generates normally once every required key detail is confirmed", async () => {
      const user = userEvent.setup();
      generateSowAction.mockClear();
      render(
        <StartSowDevelopmentPanel
          briefCompleteness={COMPLETE}
          projectId="proj_1"
          currentTemplate={selectedTemplate}
          currentTemplateVersion={{ id: "sow_baseline_v1" }}
          templateOptions={templateOptions}
          sowVersions={[]}
        />
      );

      expect(screen.queryByText(/still need/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate SOW" }));

      expect(generateSowAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("We can't generate the SOW yet")).not.toBeInTheDocument();
    });
  });
});
