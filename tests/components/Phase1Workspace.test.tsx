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
    kickOffDate: null,
    targetCompletionDate: null,
  };
}

describe("Phase1Workspace", () => {
  it("shows the Foundation Details block and What We Need to Find Out, straight from the Position Document", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByText("Foundation Details")).toBeInTheDocument();
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

  it("does not render the checklist — it lives only in the sidebar (ProjectWorkflow), to avoid duplication", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        checklistItems={[
          { id: "item_1", label: "Assign job code", isComplete: false, detailText: null },
        ]}
      />
    );

    expect(screen.queryByText("Project Set-Up Checklist")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Assign job code" })).not.toBeInTheDocument();
  });

  it("shows a compact progress summary computed from the live data", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        clientUpdates={[
          {
            id: "u1",
            content: "Confirmed budget.",
            createdAt: new Date("2026-08-01T10:00:00Z"),
            createdByName: null,
          },
        ]}
        checklistItems={[
          { id: "item_1", label: "Assign job code", isComplete: true, detailText: null },
          { id: "item_2", label: "Create Teams channel", isComplete: false, detailText: null },
        ]}
      />
    );

    const summary = screen.getByLabelText("Phase 1 progress summary");
    expect(summary).toHaveTextContent("1 confirmed detail");
    expect(summary).toHaveTextContent("1 open question");
    expect(summary).toHaveTextContent("1 client update logged");
    expect(summary).toHaveTextContent("1/2 checklist items complete");
  });

  it("pluralizes progress summary counts correctly", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        positionDocument={{
          ...positionDocument,
          whatWeKnow: [
            { topic: "Objective", detail: "Refresh the campaign." },
            { topic: "Timeline", detail: "By end of Q3." },
          ],
          whatWeNeedToFindOut: [],
        }}
        clientUpdates={[]}
        checklistItems={[]}
      />
    );

    const summary = screen.getByLabelText("Phase 1 progress summary");
    expect(summary).toHaveTextContent("2 confirmed details");
    expect(summary).toHaveTextContent("0 open questions");
    expect(summary).toHaveTextContent("0 client updates logged");
    expect(summary).toHaveTextContent("0/0 checklist items complete");
  });

  it("passes the real Project dates into Foundation Details' Timeline category", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        kickOffDate={new Date("2026-09-01T00:00:00Z")}
        targetCompletionDate={new Date("2026-12-01T00:00:00Z")}
      />
    );

    expect(screen.getByText(/Start: 1 Sept 2026/)).toBeInTheDocument();
  });

  it("shows Client Name in Foundation Details as the Position Document's primary contact", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByText("Jamie Chen — jamie@example.com")).toBeInTheDocument();
  });
});
