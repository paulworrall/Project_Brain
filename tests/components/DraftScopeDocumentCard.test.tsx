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
  flaggedGaps: ["Target audience still unknown", "Budget approval pending"],
};

describe("DraftScopeDocumentCard", () => {
  it("shows a 'not yet generated' placeholder, a Generate button, and no view-full link when null", () => {
    render(<DraftScopeDocumentCard projectId="proj_1" draftScopeDocument={null} meta={null} />);

    expect(screen.getByText("Not yet generated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View full draft/ })).not.toBeInTheDocument();
  });

  it("shows a compact summary — version/timestamp, section/gap counts, a Regenerate button, and a link to the full draft — once it exists", () => {
    render(
      <DraftScopeDocumentCard
        projectId="proj_1"
        draftScopeDocument={draftScope}
        meta={{ versionNumber: 2, createdAt: new Date("2026-08-10T09:00:00Z") }}
      />
    );

    expect(screen.getByText(/Version 2/)).toBeInTheDocument();
    expect(screen.getByText(/6 sections/)).toBeInTheDocument();
    expect(screen.getByText(/2 gaps flagged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
    // The full document content no longer renders inline on this page.
    expect(screen.queryByText("Refresh the campaign")).not.toBeInTheDocument();
    expect(screen.queryByText("⚠ Gaps Carried Forward for Specialists")).not.toBeInTheDocument();

    const link = screen.getByRole("link", { name: /View full draft/ });
    expect(link).toHaveAttribute("href", "/projects/proj_1/outputs/DRAFT_SCOPE_DOCUMENT");
  });

  it("shows 'no gaps flagged' when there are none", () => {
    render(
      <DraftScopeDocumentCard
        projectId="proj_1"
        draftScopeDocument={{ ...draftScope, flaggedGaps: [] }}
        meta={{ versionNumber: 1, createdAt: new Date("2026-08-10T09:00:00Z") }}
      />
    );

    expect(screen.getByText(/no gaps flagged/)).toBeInTheDocument();
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
