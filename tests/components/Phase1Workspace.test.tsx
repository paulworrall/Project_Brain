// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  submitClientUpdateAction: vi.fn(),
  generateDraftScopeDocumentAction: vi.fn(),
  updateChecklistItemDetailAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
}));

const { Phase1Workspace } = await import("@/components/features/Phase1Workspace");

const positionDocument = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: ["Target audience"],
  clientFlaggedOpenItems: ["Budget"],
};

const clarificationEmail = { subject: "Quick questions", bodyText: "Hi Jamie," };

function baseProps() {
  return {
    projectId: "proj_1",
    positionDocument,
    clientUpdates: [],
    clarificationEmail,
    draftScopeDocument: null,
    draftScopeDocumentMeta: null,
    checklistItems: [],
  };
}

describe("Phase1Workspace", () => {
  it("shows What We Know / What We Need to Find Out prominently, straight from the Position Document", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByText("What We Know")).toBeInTheDocument();
    expect(screen.getByText("What We Need to Find Out")).toBeInTheDocument();
    expect(screen.getByText("Refresh the campaign.")).toBeInTheDocument();
    expect(screen.getByText("Target audience")).toBeInTheDocument();
  });

  it("shows a 'not generated yet' placeholder when there's no Position Document", () => {
    render(<Phase1Workspace {...baseProps()} positionDocument={null} />);

    expect(screen.getByText("Not generated yet.")).toBeInTheDocument();
  });

  it("always shows the client update composer", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByLabelText("Add a client update")).toBeInTheDocument();
  });

  it("shows the Clarification Email and Draft Scope Document cards side by side", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByText("Clarification email")).toBeInTheDocument();
    expect(screen.getByText("Draft scope document")).toBeInTheDocument();
    expect(screen.getByText("Quick questions")).toBeInTheDocument();
    // No Draft Scope Document generated yet in this fixture.
    expect(screen.getByText("Not yet generated.")).toBeInTheDocument();
  });

  it("shows the checklist below the document cards", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        checklistItems={[
          { id: "item_1", label: "Assign job code", isComplete: false, detailText: null },
        ]}
      />
    );

    expect(screen.getByText("Project Set-Up Checklist")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Assign job code" })).toBeInTheDocument();
  });
});
