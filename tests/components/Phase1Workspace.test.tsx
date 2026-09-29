// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  generateDraftScopeDocumentAction: vi.fn(),
  updateChecklistItemDetailAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  suggestCapabilitiesAction: vi.fn(),
  updateConfirmedCapabilitiesAction: vi.fn(),
  generateEstimateBriefAction: vi.fn(),
  saveBriefAttributeAction: vi.fn(),
  rereadBriefAttributesAction: vi.fn(),
  updatePmPerspectiveFieldAction: vi.fn(),
}));

const { Phase1Workspace } = await import("@/components/features/Phase1Workspace");
const { briefCompleteness, briefRecord, ALL_REQUIRED_CONFIRMED } = await import(
  "../fixtures/briefCompleteness"
);
const { pmPerspectiveView } = await import("../fixtures/pmPerspective");

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
    briefCompleteness: briefCompleteness(),
    pmPerspective: pmPerspectiveView(),
    confirmedCapabilities: [],
    estimateBriefVersion: null,
  };
}

describe("Phase1Workspace", () => {
  it("shows the What We Need to Find Out checklist and the other brief details", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByRole("heading", { name: "What We Need to Find Out" })).toBeInTheDocument();
    // One checklist — the key details aren't repeated in a second panel.
    expect(screen.queryByText("Key details")).not.toBeInTheDocument();
    expect(screen.getByText("Other details from the brief")).toBeInTheDocument();
    expect(screen.getByText("Refresh the campaign.")).toBeInTheDocument();
  });

  it("never shows the old AI-generated questions an existing project's Position Document still carries", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByText("Target audience")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier open questions")).not.toBeInTheDocument();
  });

  it("shows a 'not generated yet' placeholder when there's no Position Document", () => {
    render(<Phase1Workspace {...baseProps()} positionDocument={null} />);

    expect(screen.getByText("Not generated yet.")).toBeInTheDocument();
  });

  it("does not render its own client-update composer — that's now the sidebar's Additional Inputs panel", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByLabelText("Add a client update")).not.toBeInTheDocument();
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
    expect(summary).toHaveTextContent("1 other detail from the brief");
    // Nothing confirmed yet: all 4 required details are still to find out.
    expect(summary).toHaveTextContent("4 required details to find out");
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
        }}
        briefCompleteness={briefCompleteness(ALL_REQUIRED_CONFIRMED.slice(1))}
        clientUpdates={[]}
        checklistItems={[]}
      />
    );

    const summary = screen.getByLabelText("Phase 1 progress summary");
    expect(summary).toHaveTextContent("2 other details from the brief");
    expect(summary).toHaveTextContent("1 required detail to find out");
    expect(summary).toHaveTextContent("0 client updates logged");
    expect(summary).toHaveTextContent("0/0 checklist items complete");
  });

  it("lists the 4 required key details with their status and question", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness([briefRecord("budget", { amount: "£50,000" })])}
      />
    );

    expect(screen.getByText("1 of 4 required details captured", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Timeline and Key Milestones" })).toBeInTheDocument();
    expect(screen.getByText("Who is the client contact who will be running the project?")).toBeInTheDocument();
    expect(screen.getByText("£50,000", { selector: "p" })).toBeInTheDocument();
  });

  it("counts a value captured from the brief straight away, tagged with its source — nothing to approve", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness([
          briefRecord(
            "clientContact",
            { name: "Jamie Chen", email: "jamie@example.com" },
            { kind: "SUGGESTION", source: "BRIEF", evidence: "Contact: Jamie Chen" }
          ),
        ])}
      />
    );

    expect(screen.getByText("From brief")).toBeInTheDocument();
    expect(screen.getByText("Jamie Chen · jamie@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Client Contact" })).toBeInTheDocument();
    expect(screen.getByText("1 of 4 required details captured", { exact: false })).toBeInTheDocument();
    const checklist = screen.getByRole("heading", { name: "What We Need to Find Out" }).closest("div.p-5, [class*='p-5']")!;
    expect(checklist).not.toHaveTextContent(/confirm/i);
    expect(checklist).not.toHaveTextContent(/suggestion/i);
  });

  it("shows the PM perspective in its own labelled panel, apart from what came from the client", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        pmPerspective={pmPerspectiveView({ initialThoughts: { content: "PM-only context about the client." } })}
      />
    );

    const pmPanel = screen.getByRole("region", { name: "PM perspective" });
    expect(pmPanel).toHaveTextContent("PM-only context about the client.");
    expect(pmPanel).not.toHaveTextContent("Refresh the campaign.");
    expect(screen.getByText("Current position — from the client")).toBeInTheDocument();
    // The client-side view never shows the PM's words.
    const clientSide = screen.getByText("Other details from the brief").closest("div")!;
    expect(clientSide).not.toHaveTextContent("PM-only context about the client.");
  });

  it("never counts a PM-perspective suggestion as a captured key detail", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness([
          briefRecord("objective", { successMeasures: "20% more monthly actives" }, { kind: "SUGGESTION", source: "PM_ENTRY" }),
        ])}
      />
    );

    expect(screen.queryByText("20% more monthly actives")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Objective" })).toBeInTheDocument();
    expect(screen.getByText("0 of 4 required details captured", { exact: false })).toBeInTheDocument();
  });
});
