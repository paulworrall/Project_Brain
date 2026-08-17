// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const generateDraftScopeDocumentAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  generateDraftScopeDocumentAction,
}));

const { DraftScopeDocumentCard } = await import("@/components/features/DraftScopeDocumentCard");

const draftScope = {
  objectives: ["Refresh the campaign"],
  deliverables: ["Creative assets"],
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: {
    contacts: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
    capabilities: ["Creative"],
  },
  budget: { summary: "Confirmed at £100k", isConfirmed: true },
  assumptionsAndConstraints: ["UK market only"],
  flaggedGaps: [] as string[],
};

describe("DraftScopeDocumentCard", () => {
  it("shows a 'not yet generated' placeholder and a Generate button when null", () => {
    render(<DraftScopeDocumentCard projectId="proj_1" draftScopeDocument={null} meta={null} />);

    expect(screen.getByText("Not yet generated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("shows the document, its version/timestamp, and a Regenerate button once it exists", () => {
    render(
      <DraftScopeDocumentCard
        projectId="proj_1"
        draftScopeDocument={draftScope}
        meta={{ versionNumber: 2, createdAt: new Date("2026-08-10T09:00:00Z") }}
      />
    );

    expect(screen.getByText(/Version 2/)).toBeInTheDocument();
    expect(screen.getByText("Refresh the campaign")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
  });

  it("submits the generate action when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<DraftScopeDocumentCard projectId="proj_1" draftScopeDocument={null} meta={null} />);

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(generateDraftScopeDocumentAction).toHaveBeenCalled();
  });

  it("can be triggered again once a document already exists, for regeneration", async () => {
    const user = userEvent.setup();
    render(
      <DraftScopeDocumentCard
        projectId="proj_1"
        draftScopeDocument={draftScope}
        meta={{ versionNumber: 1, createdAt: new Date("2026-08-10T09:00:00Z") }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(generateDraftScopeDocumentAction).toHaveBeenCalled();
  });
});
