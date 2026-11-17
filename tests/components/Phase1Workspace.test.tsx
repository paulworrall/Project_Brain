// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  suggestCapabilitiesAction: vi.fn(),
  updateConfirmedCapabilitiesAction: vi.fn(),
  generateEstimateBriefAction: vi.fn(),
  saveBriefAttributeAction: vi.fn(),
  rereadBriefAttributesAction: vi.fn(),
  updatePmPerspectiveFieldAction: vi.fn(),
}));

const { Phase1Workspace } = await import("@/components/features/Phase1Workspace");
const { briefCompleteness, briefRecord, ALL_REQUIRED_CONFIRMED } =
  await import("../fixtures/briefCompleteness");
const { pmPerspectiveView } = await import("../fixtures/pmPerspective");

const positionDocument = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: ["Target audience"],
  clientFlaggedOpenItems: ["Budget"],
};

const { buildScopeView } = await import("@/lib/scopeSummaryView");
const { openQuestionsText } = await import("@/lib/openQuestionsText");
const scopeContent = {
  context: "Fizzy wants to refresh the campaign.",
  outOfScope: [],
  deliverables: ["Campaign concept"],
  constraints: [],
  assumptions: [],
  openQuestions: ["Which markets first?"],
};
function scopeSummary(confirmedVersionNumber: number | null = null) {
  return {
    versionId: "sv2",
    versionNumber: 2,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    content: scopeContent,
    sections: buildScopeView(scopeContent, briefCompleteness()),
    confirmedVersionNumber,
  };
}

function baseProps() {
  return {
    projectId: "proj_1",
    scopeSummary: scopeSummary(),
    briefCompleteness: briefCompleteness(),
    pmPerspective: pmPerspectiveView(),
  };
}

describe("Phase1Workspace", () => {
  it("shows no staleness banner on the email; the only Regenerate is the Scope summary's own", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByText(/Built from v/)).not.toBeInTheDocument();
    expect(screen.queryByText(/key details have changed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Key details changed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vd+ is available/)).not.toBeInTheDocument();
    const regenerate = screen.getAllByRole("button", { name: /^regenerate$/i });
    expect(regenerate).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Scope summary" })).toContainElement(regenerate[0]);
  });

  it("shows the Scope summary with its sections, and the What we need to find out checklist", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.getByRole("heading", { name: "What we need to find out" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Scope summary" });
    expect(card).toHaveTextContent("v2");
    expect(card).toHaveTextContent("Fizzy wants to refresh the campaign.");
    expect(card).toHaveTextContent("Campaign concept");
    expect(card).toHaveTextContent("Which markets first?");
    expect(screen.queryByText("Current position — from the client")).not.toBeInTheDocument();
  });
  it("never shows the old AI-generated questions an existing project's Position Document still carries", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        earlierDocuments={{ positionDocument, draftScopeDocument: null }}
      />
    );

    expect(screen.queryByText("Target audience")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier open questions")).not.toBeInTheDocument();
  });
  it("offers to draft a Scope summary when there is none", () => {
    render(<Phase1Workspace {...baseProps()} scopeSummary={null} />);

    expect(screen.getByText("No scope summary yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft the scope summary" })).toBeInTheDocument();
  });

  it("keeps a legacy project's earlier documents read-only, with Create scope summary", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        scopeSummary={null}
        earlierDocuments={{ positionDocument, draftScopeDocument: null }}
      />
    );

    expect(screen.getByText("Earlier documents")).toBeInTheDocument();
    expect(screen.getByText("Refresh the campaign.", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create scope summary" })
    ).toBeInTheDocument();
  });
  it("does not render its own client-update composer — that's now the sidebar's Additional Inputs panel", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByLabelText("Add a client update")).not.toBeInTheDocument();
  });

  it("has no Clarification email card, Mark as sent or Download any more (FB-011)", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByText("Clarification email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as sent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("copies the open questions as a numbered list and announces Copied (FB-011)", async () => {
    const user = userEvent.setup();
    render(<Phase1Workspace {...baseProps()} />);

    const expected = openQuestionsText(scopeSummary().sections);
    expect(expected).toMatch(/^1\. /);
    expect(expected).toContain("Which markets first?");

    await user.click(screen.getByRole("button", { name: "Copy questions" }));
    expect(await navigator.clipboard.readText()).toBe(expected);
    expect(within(screen.getByRole("region", { name: "Scope summary" })).getByText("Copied")).toBeInTheDocument();
  });

  it("offers no Copy questions button when there are no open questions", () => {
    const empty = { ...scopeContent, openQuestions: [] };
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness(ALL_REQUIRED_CONFIRMED)}
        scopeSummary={{
          ...scopeSummary(),
          content: empty,
          sections: buildScopeView(empty, briefCompleteness(ALL_REQUIRED_CONFIRMED)),
        }}
      />
    );
    expect(screen.queryByRole("button", { name: "Copy questions" })).not.toBeInTheDocument();
  });

  it("offers Confirm vN when a newer version than the confirmed one exists", () => {
    render(<Phase1Workspace {...baseProps()} scopeSummary={scopeSummary(1)} />);

    expect(screen.getByText(/v2 has changes since the confirmed v1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm v2" })).toBeInTheDocument();
  });
  it("does not render the readiness checklist or the Capabilities panel — BriefStep and the Estimate step own those (FB-008)", () => {
    render(<Phase1Workspace {...baseProps()} />);

    expect(screen.queryByText("Before you move on")).not.toBeInTheDocument();
    expect(screen.queryByText(/Capabilities/)).not.toBeInTheDocument();
    expect(screen.queryByText(/checklist items complete/)).not.toBeInTheDocument();
  });

  it("makes key details and the PM perspective read-only once the project is complete", () => {
    const { container } = render(<Phase1Workspace {...baseProps()} readOnly />);
    expect(container.querySelector("fieldset")).toBeDisabled();
  });

  it("has no progress meta line — its information lives in the sub-task summaries (FB-012)", () => {
    render(<Phase1Workspace {...baseProps()} />);
    expect(screen.queryByLabelText("Brief progress summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/updates? logged/)).not.toBeInTheDocument();
  });

  it("lists the 4 required key details with their status and question", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness([briefRecord("budget", { amount: "£50,000" })])}
      />
    );

    expect(
      screen.getByText("1 of 4 required details captured", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Timeline and Key Milestones" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Who is the client contact who will be running the project?")
    ).toBeInTheDocument();
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
    expect(
      screen.getByText("1 of 4 required details captured", { exact: false })
    ).toBeInTheDocument();
    const checklist = screen
      .getByRole("heading", { name: "What we need to find out" })
      .closest("div.p-5, [class*='p-5']")!;
    expect(checklist).not.toHaveTextContent(/confirm/i);
    expect(checklist).not.toHaveTextContent(/suggestion/i);
  });

  it("shows the PM perspective in its own labelled panel, apart from what came from the client", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        pmPerspective={pmPerspectiveView({
          initialThoughts: { content: "PM-only context about the client." },
        })}
      />
    );

    const pmPanel = screen.getByRole("region", { name: "PM perspective" });
    expect(pmPanel).toHaveTextContent("PM-only context about the client.");
    expect(pmPanel).not.toHaveTextContent("Fizzy wants to refresh the campaign.");
    // The Scope summary never shows the PM's words.
    expect(screen.getByRole("region", { name: "Scope summary" })).not.toHaveTextContent(
      "PM-only context about the client."
    );
  });

  it("never counts a PM-perspective suggestion as a captured key detail", () => {
    render(
      <Phase1Workspace
        {...baseProps()}
        briefCompleteness={briefCompleteness([
          briefRecord(
            "objective",
            { successMeasures: "20% more monthly actives" },
            { kind: "SUGGESTION", source: "PM_ENTRY" }
          ),
        ])}
      />
    );

    expect(screen.queryByText("20% more monthly actives")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Objective" })).toBeInTheDocument();
    expect(
      screen.getByText("0 of 4 required details captured", { exact: false })
    ).toBeInTheDocument();
  });
});
