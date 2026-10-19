// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SowChange, SowChangeStatus } from "@/lib/sowChangeView";

const startSowDevelopmentAction = vi.fn(async () => undefined);
const generateSowAction = vi.fn(async () => undefined);

const startSowReviewAction = vi.fn(async () => ({
  items: [
    {
      id: "item_1",
      section: "DELIVERABLES",
      text: "A relaunched app",
      agentOriginalText: "A relaunched app",
      source: "AGENT",
      included: true,
      position: 0,
      isNewSinceLastReview: false,
      pendingAgentSuggestion: null,
      version: 0,
    },
  ],
  currentStep: 0,
}));

vi.mock("@/app/(dashboard)/projects/[projectId]/sow-review-actions", () => ({
  startSowReviewAction,
  saveSowReviewStepAction: vi.fn(async () => undefined),
  saveSowItemAction: vi.fn(),
  revertSowItemAction: vi.fn(),
  acceptSowSuggestionAction: vi.fn(),
  dismissSowSuggestionAction: vi.fn(),
  addSowItemAction: vi.fn(),
  deleteSowItemAction: vi.fn(),
}));

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  startSowDevelopmentAction,
  generateSowAction,
  saveBriefAttributeAction: vi.fn(),
  confirmSowEstimateSourceAction: vi.fn(),
  updateSowFromEstimateAction: vi.fn(),
  rereadBriefAttributesAction: vi.fn(),
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

  it("enables 'Generate SOW' once a template is selected; clicking opens the review overlay rather than generating straight away", async () => {
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

    generateSowAction.mockClear();
    await user.click(generateButton);
    expect(startSowReviewAction).toHaveBeenCalledWith("proj_1");
    expect(await screen.findByRole("dialog", { name: /review the deliverables/i })).toBeInTheDocument();
    expect(screen.getByTestId("step-indicator")).toHaveTextContent("Step 1 of 6: Deliverables");
    expect(generateSowAction).not.toHaveBeenCalled();
  });

  it("runs composition (generateSowAction) only from the review's final step, then returns focus to the trigger", async () => {
    const user = userEvent.setup();
    generateSowAction.mockClear();
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
    const trigger = screen.getByRole("button", { name: "Generate SOW" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: /review the deliverables/i });

    // Step through every section to the end.
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole("button", { name: /^next/i }));
      // Empty optional sections ask for confirmation.
      const confirm = screen.queryByRole("button", { name: "Continue" });
      if (confirm) await user.click(confirm);
    }
    expect(screen.getByTestId("step-indicator")).toHaveTextContent("Step 6 of 6: Review & generate");
    await user.click(within(screen.getByTestId("sow-review-overlay")).getByRole("button", { name: "Generate SOW" }));

    expect(generateSowAction).toHaveBeenCalledTimes(1);
    // Success state shows briefly, then both overlays dismiss into the page.
    await waitFor(() => expect(screen.queryByTestId("sow-review-overlay")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole("button", { name: "Generate SOW" })).toHaveFocus();
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

    it("refuses on click when required key details are missing, listing exactly what's missing — without calling the action", async () => {
      const user = userEvent.setup();
      startSowReviewAction.mockClear();
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

      expect(screen.getByText(/3 required key details still need adding/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate SOW" }));

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("We can't generate the SOW yet");
      expect(alert).toHaveTextContent("Objective (partial), Timeline and Key Milestones (missing), Client Contact (missing)");
      expect(screen.queryByRole("heading", { name: "Budget" })).not.toBeInTheDocument();
      expect(screen.getByText("Still needed: Success measures (OKRs/KPIs)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Timeline and Key Milestones" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Client Contact" })).toBeInTheDocument();
      // The partial Objective can be updated right there too.
      expect(screen.getByRole("button", { name: "Update Objective" })).toBeInTheDocument();
      expect(startSowReviewAction).not.toHaveBeenCalled();
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
      await user.click(screen.getByRole("button", { name: "Add Client Contact" }));

      expect(screen.getByLabelText(/^Name/)).toBeVisible();
      expect(screen.getByLabelText(/^Email/)).toBeVisible();
      expect(screen.getByLabelText(/^Role/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    });

    it("generates normally once every required key detail is captured", async () => {
      const user = userEvent.setup();
      startSowReviewAction.mockClear();
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

      expect(startSowReviewAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("We can't generate the SOW yet")).not.toBeInTheDocument();
    });
  });

  describe("changes since the SOW was generated", () => {
    const sowVersions = [
      { id: "sowv_2", versionNumber: 2, createdAt: new Date("2026-09-20T10:00:00Z") },
      { id: "sowv_1", versionNumber: 1, createdAt: new Date("2026-09-10T10:00:00Z") },
    ];
    const change = (n: number, extra: Partial<SowChange> = {}): SowChange => ({
      versionLabel: `v${n}`,
      date: new Date("2026-10-13T10:00:00Z"),
      source: "Client",
      fields: ["Budget"],
      summary: `Budget restated (${n})`,
      ...extra,
    });
    const versions = [
      { sowVersionId: "sowv_2", sowVersionNumber: 2, label: "SOW v2 — from Estimate v1 — 50,400.00 USD", status: "in_sync" as const },
      { sowVersionId: "sowv_1", sowVersionNumber: 1, label: "SOW v1 — source unknown", status: "unlinked" as const },
    ];
    const upToDate: SowChangeStatus = {
      status: "up_to_date",
      changes: [],
      sowVersionId: "sowv_2",
      sowVersionNumber: 2,
      estimateSync: null,
      versions,
    };
    const changed = (changes: SowChange[]): SowChangeStatus => ({ ...upToDate, status: "changed_since_generation", changes });

    function renderPanel(sowChange: SowChangeStatus) {
      render(
        <StartSowDevelopmentPanel
          briefCompleteness={COMPLETE}
          projectId="proj_1"
          currentTemplate={{ id: "sow_baseline", name: "Standard SOW Template" }}
          currentTemplateVersion={{ id: "sow_baseline_v1" }}
          templateOptions={templateOptions}
          sowVersions={sowVersions}
          sowChange={sowChange}
        />
      );
    }

    it("labels each version with the estimate version it came from", () => {
      renderPanel(upToDate);
      expect(screen.getByText(/SOW v2 — from Estimate v1 — 50,400.00 USD/)).toBeInTheDocument();
      expect(screen.getByText(/SOW v1 — source unknown/)).toBeInTheDocument();
    });

    it("shows one notice above the SOW content, lists the changes, and guards the latest download", () => {
      renderPanel(changed([change(3)]));

      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent("Updates since this SOW was generated");
      expect(notice).toHaveTextContent("v3 · 13 Oct 2026 · Client — Budget restated (3)");
      expect(screen.getAllByRole("status")).toHaveLength(1);
      // Notice sits before the version line.
      const version = screen.getByText(/Version 2 —/);
      expect(notice.compareDocumentPosition(version) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The latest download is guarded; the older version's isn't.
      expect(screen.getByRole("button", { name: "Download .docx →" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Download →" })).toHaveAttribute("href", "/api/projects/proj_1/sow/sowv_1");
    });

    it("shows no notice and a plain download when nothing material changed", () => {
      renderPanel(upToDate);
      expect(screen.queryByText("Updates since this SOW was generated")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Download .docx →" })).toBeInTheDocument();
    });

    it("never offers a one-click Update SOW or any Regenerate button in the notice — only a link into the review step", async () => {
      const user = userEvent.setup();
      renderPanel(changed([change(3)]));

      expect(screen.queryByRole("button", { name: /^update sow/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
      const callsBefore = generateSowAction.mock.calls.length;
      startSowReviewAction.mockClear();

      await user.click(screen.getByRole("button", { name: "Review and update the SOW" }));

      expect(startSowReviewAction).toHaveBeenCalledTimes(1);
      expect(generateSowAction.mock.calls.length).toBe(callsBefore);
    });
  });
});
