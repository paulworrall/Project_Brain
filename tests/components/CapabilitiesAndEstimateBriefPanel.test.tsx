// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CapabilitySuggestionActionState } from "@/app/(dashboard)/projects/[projectId]/actions";

const suggestCapabilitiesAction = vi.fn(
  async (
    _projectId: string,
    _prevState: CapabilitySuggestionActionState | undefined,
    _formData: FormData
  ): Promise<CapabilitySuggestionActionState> => ({
    suggestions: [
      {
        capability: "TECH_AND_DATA",
        rationale: "The brief mentions integrating with the client's CRM.",
      },
    ],
    isLowConfidence: false,
    lowConfidenceReason: null,
  })
);
const updateConfirmedCapabilitiesAction = vi.fn(
  async (_projectId: string, _prevState: unknown, _formData: FormData) => undefined
);
const generateEstimateBriefAction = vi.fn(
  async (_projectId: string, _prevState: unknown, _formData: FormData) => undefined
);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  suggestCapabilitiesAction,
  updateConfirmedCapabilitiesAction,
  generateEstimateBriefAction,
}));

const { CapabilitiesAndEstimateBriefPanel } = await import(
  "@/components/features/CapabilitiesAndEstimateBriefPanel"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CapabilitiesAndEstimateBriefPanel", () => {
  it("renders all 12 MAP capabilities, pre-checking whatever is already confirmed", () => {
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={["TECH_AND_DATA"]}
        estimateBriefVersion={null}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Tech & Data/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Marketing Operations/ })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
  });

  it("lets a PM manually toggle capabilities and save them", async () => {
    const user = userEvent.setup();
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={[]}
        estimateBriefVersion={null}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /Experience Design/ }));
    await user.click(screen.getByRole("button", { name: "Save confirmed capabilities" }));

    await waitFor(() => expect(updateConfirmedCapabilitiesAction).toHaveBeenCalled());
    const formData = updateConfirmedCapabilitiesAction.mock.calls[0][2] as FormData;
    expect(formData.getAll("capabilities")).toEqual(["EXPERIENCE_DESIGN"]);
  });

  it("populates suggestions as pre-checked options with a rationale, without saving them", async () => {
    const user = userEvent.setup();
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={[]}
        estimateBriefVersion={null}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Tech & Data/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Not sure? Get suggestions" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Tech & Data/ })).toBeChecked());
    expect(
      screen.getByText("The brief mentions integrating with the client's CRM.")
    ).toBeInTheDocument();
    // Suggestions never auto-confirm — only Save does that.
    expect(updateConfirmedCapabilitiesAction).not.toHaveBeenCalled();
  });

  it("surfaces a low-confidence signal instead of presenting thin-brief guesses as certain", async () => {
    suggestCapabilitiesAction.mockResolvedValueOnce({
      suggestions: [],
      isLowConfidence: true,
      lowConfidenceReason: "The brief has almost no captured content yet.",
    });
    const user = userEvent.setup();
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={[]}
        estimateBriefVersion={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Not sure? Get suggestions" }));

    await waitFor(() =>
      expect(screen.getByText(/The brief has almost no captured content yet\./)).toBeInTheDocument()
    );
  });

  it("disables 'Prepare the estimate brief' until at least one capability is confirmed", () => {
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={[]}
        estimateBriefVersion={null}
      />
    );

    expect(screen.getByRole("button", { name: "Prepare the estimate brief" })).toBeDisabled();
  });

  it("generates the brief once a capability is confirmed, and shows a download link once generated", async () => {
    const user = userEvent.setup();
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={["TECH_AND_DATA"]}
        estimateBriefVersion={null}
      />
    );

    const generateButton = screen.getByRole("button", { name: "Prepare the estimate brief" });
    expect(generateButton).toBeEnabled();
    await user.click(generateButton);

    await waitFor(() => expect(generateEstimateBriefAction).toHaveBeenCalled());
  });

  it("shows version info and a working download link once a version exists", () => {
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={["TECH_AND_DATA"]}
        estimateBriefVersion={{
          id: "version_1",
          versionNumber: 2,
          createdAt: new Date("2026-09-01T10:00:00Z"),
          capabilities: ["TECH_AND_DATA"],
        }}
      />
    );

    expect(screen.getByText(/Version 2/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Download .docx/ });
    expect(link).toHaveAttribute("href", "/api/projects/proj_1/estimate-brief/version_1");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("flags a stale brief once the confirmed capabilities differ from the version's snapshot", () => {
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={["TECH_AND_DATA", "EXPERIENCE_DESIGN"]}
        estimateBriefVersion={{
          id: "version_1",
          versionNumber: 1,
          createdAt: new Date("2026-09-01T10:00:00Z"),
          capabilities: ["TECH_AND_DATA"],
        }}
      />
    );

    expect(screen.getByText(/Capabilities have changed since this was generated/)).toBeInTheDocument();
  });

  it("does not flag staleness when the confirmed set matches the version's snapshot, regardless of order", () => {
    render(
      <CapabilitiesAndEstimateBriefPanel
        projectId="proj_1"
        confirmedCapabilities={["EXPERIENCE_DESIGN", "TECH_AND_DATA"]}
        estimateBriefVersion={{
          id: "version_1",
          versionNumber: 1,
          createdAt: new Date("2026-09-01T10:00:00Z"),
          capabilities: ["TECH_AND_DATA", "EXPERIENCE_DESIGN"],
        }}
      />
    );

    expect(screen.queryByText(/Capabilities have changed since this was generated/)).not.toBeInTheDocument();
  });
});
