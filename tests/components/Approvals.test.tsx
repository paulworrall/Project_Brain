// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApprovalInfo, ApprovedDocSummary } from "@/types/approvals";

const approveEstimateVersion = vi.fn();
const undoApprovalAction = vi.fn();
vi.mock("@/app/(dashboard)/projects/[projectId]/approval-actions", () => ({
  approveEstimateVersion,
  approveSowVersion: vi.fn(),
  undoApprovalAction,
  revertApprovalAction: vi.fn(),
}));

vi.mock("@/app/(dashboard)/projects/[projectId]/estimates/actions", () => ({
  createEstimateAction: vi.fn(),
  addEstimateRoleInputAction: vi.fn(),
  updateRoleResolutionQuantityAction: vi.fn(),
  resolveRoleResolutionAction: vi.fn(),
  saveEstimateVersionAction: vi.fn(),
}));

const { DocumentStatusBadge } = await import("@/components/ui/DocumentStatusBadge");
const { ApprovalActions } = await import("@/components/features/ApprovalActions");
const { ApprovedDocumentsPanel } = await import("@/components/features/ApprovedDocumentsPanel");
const { LockedNotice } = await import("@/components/features/LockedNotice");
const { EstimatesListPanel } = await import("@/components/features/EstimatesListPanel");

const approval: ApprovalInfo = {
  id: "a1",
  clientApprovedOn: "2026-10-18",
  clientApproverName: "Caroline",
  reference: "PO-123",
  recordedBy: { id: "u1", name: "Pat PM" },
  recordedAt: "2026-10-18T10:00:00.000Z",
};

const summary = {
  name: "Initial estimate",
  versionNumber: 1,
  generatedDate: "18 Oct 2026",
  total: 45675,
  currency: "USD",
  capabilities: ["TECH_AND_DATA" as const],
};

describe("DocumentStatusBadge", () => {
  it.each([
    ["draft", undefined, "Draft"],
    ["approved", "2026-10-18", "Client approved · 18 Oct 2026"],
    ["superseded", undefined, "Superseded"],
    ["not_approved", undefined, "Not approved"],
  ] as const)("renders %s with an icon and text", (state, approvedOn, text) => {
    const { container } = render(<DocumentStatusBadge state={state} approvedOn={approvedOn} />);
    expect(screen.getByRole("img", { name: `Document status: ${text}` })).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container).toHaveTextContent(text);
  });

  it("explains a draft in a tooltip", () => {
    render(<DocumentStatusBadge state="draft" />);
    expect(screen.getByTitle("Not yet approved by the client")).toBeInTheDocument();
  });
});

describe("ApprovalActions", () => {
  const base = {
    documentType: "ESTIMATE" as const,
    versionId: "ev1",
    versionNumber: 1,
    summary,
    focusId: "card",
  };

  it("offers approval to a user who may approve, only on a draft", () => {
    const { rerender } = render(
      <ApprovalActions
        {...base}
        approvalState="draft"
        approval={null}
        permissions={{ canApprove: true, canRevert: false }}
      />
    );
    expect(screen.getByRole("button", { name: "Mark as client approved" })).toBeInTheDocument();
    rerender(
      <ApprovalActions
        {...base}
        approvalState="superseded"
        approval={null}
        permissions={{ canApprove: true, canRevert: false }}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Mark as client approved" })
    ).not.toBeInTheDocument();
  });

  it("hides the revert action unless the user may revert", () => {
    const { rerender } = render(
      <ApprovalActions
        {...base}
        approvalState="approved"
        approval={approval}
        permissions={{ canApprove: true, canRevert: false }}
      />
    );
    expect(screen.queryByRole("button", { name: "Revert to draft" })).not.toBeInTheDocument();
    rerender(
      <ApprovalActions
        {...base}
        approvalState="approved"
        approval={approval}
        permissions={{ canApprove: true, canRevert: true }}
      />
    );
    expect(screen.getByRole("button", { name: "Revert to draft" })).toBeInTheDocument();
  });

  it("keeps a blocked approval focusable, explained and inert", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalActions
        {...base}
        documentType="SOW"
        approvalState="draft"
        approval={null}
        permissions={{ canApprove: true, canRevert: false }}
        blockedReason="Approve the estimate first."
      />
    );
    const button = screen.getByRole("button", { name: "Mark as client approved" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Approve the estimate first.");
    await user.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("validates the dialog, then approves, announces and offers Undo", async () => {
    const user = userEvent.setup();
    approveEstimateVersion.mockResolvedValueOnce({
      ok: true,
      data: { approvalId: "a9", projectId: "p1", documentType: "ESTIMATE", versionNumber: 1 },
    });
    undoApprovalAction.mockResolvedValueOnce({
      ok: true,
      data: { approvalId: "a9", projectId: "p1", documentType: "ESTIMATE", versionNumber: 1 },
    });
    render(
      <ApprovalActions
        {...base}
        approvalState="draft"
        approval={null}
        permissions={{ canApprove: true, canRevert: false }}
      />
    );
    await user.click(screen.getByRole("button", { name: "Mark as client approved" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("45,675.00 USD");
    expect(dialog).toHaveTextContent("Changes will need a change request");
    const confirm = screen.getByRole("button", { name: "Confirm approval" });
    expect(confirm).toBeDisabled();

    const nameField = screen.getByLabelText(/Approved by/);
    await user.click(nameField);
    await user.tab();
    expect(await screen.findByText("Enter the client contact who approved.")).toBeInTheDocument();

    await user.type(nameField, "Caroline");
    expect(confirm).toBeDisabled(); // checkbox still required
    await user.click(screen.getByLabelText("I confirm the client has approved this exact version"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(approveEstimateVersion).toHaveBeenCalled());
    expect(approveEstimateVersion.mock.calls[0][0]).toMatchObject({
      versionId: "ev1",
      clientApproverName: "Caroline",
    });
    // Announced in the live region AND shown in the toast.
    expect((await screen.findAllByText(/Estimate v1 marked as client approved/)).length).toBe(2);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undoApprovalAction).toHaveBeenCalledWith({ approvalId: "a9" });
  });

  it("shows a field error from the server next to the field", async () => {
    const user = userEvent.setup();
    approveEstimateVersion.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { clientApproverName: "Keep the name under 120 characters." },
    });
    render(
      <ApprovalActions
        {...base}
        approvalState="draft"
        approval={null}
        permissions={{ canApprove: true, canRevert: false }}
      />
    );
    await user.click(screen.getByRole("button", { name: "Mark as client approved" }));
    await user.type(screen.getByLabelText(/Approved by/), "Caroline");
    await user.click(screen.getByLabelText("I confirm the client has approved this exact version"));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("Keep the name under 120 characters.")).toBeInTheDocument();
  });
});

describe("ApprovedDocumentsPanel", () => {
  const estimateDoc: ApprovedDocSummary = {
    documentType: "ESTIMATE",
    name: "Initial estimate",
    versionId: "ev1",
    versionNumber: 1,
    total: 45675,
    currency: "USD",
    approval,
    downloadHref: "/api/x",
    sectionId: "estimates",
  };

  it("sits in the shared sidebar panel: icon badge, title and subtitle, in both states", () => {
    const { container, rerender } = render(<ApprovedDocumentsPanel summary={{ estimate: null, sow: null }} />);
    const check = () => {
      expect(screen.getByRole("heading", { name: "Approved documents" })).toBeInTheDocument();
      expect(
        screen.getByText("Client-approved versions are locked. Changes need a change request.")
      ).toBeInTheDocument();
      const badge = container.querySelector("span.rounded-full.bg-primary");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge?.querySelector("svg")).not.toBeNull();
      // Same card treatment as the other sidebar panels.
      expect(container.firstElementChild).toHaveClass("border-2", "p-5");
    };
    check();
    rerender(<ApprovedDocumentsPanel summary={{ estimate: estimateDoc, sow: null }} />);
    check();
  });

  it("always shows both slots, with a placeholder for what is not approved", () => {
    render(<ApprovedDocumentsPanel summary={{ estimate: null, sow: null }} />);
    expect(screen.getAllByText("Not yet approved")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Statement of Work" })).toBeInTheDocument();
  });

  it("shows the approval details, download and a link to the section", () => {
    render(<ApprovedDocumentsPanel summary={{ estimate: estimateDoc, sow: null }} />);
    const slot = screen.getByRole("region", { name: "Estimate" });
    expect(slot).toHaveTextContent("Initial estimate · v1");
    expect(slot).toHaveTextContent("45,675.00 USD");
    expect(slot).toHaveTextContent("Approved 18 Oct 2026 by Caroline");
    expect(slot).toHaveTextContent("Reference: PO-123");
    expect(slot).toHaveTextContent("Recorded by Pat PM on 18 Oct 2026");
    expect(screen.getByRole("link", { name: "Download .docx" })).toHaveAttribute("href", "/api/x");
    expect(screen.getByRole("link", { name: "Go to section" })).toHaveAttribute(
      "href",
      "#estimates"
    );
    expect(screen.getAllByText("Not yet approved")).toHaveLength(1);
  });
});

describe("locked estimates", () => {
  const estimates = [
    {
      id: "e1",
      label: "Initial estimate",
      versions: [
        {
          id: "ev1",
          versionNumber: 1,
          createdAt: new Date("2026-10-01"),
          totalValue: 45675,
          currency: "USD",
          description: "1 capability",
          needsRecalculation: false,
          approvalState: "approved" as const,
          approval,
        },
      ],
    },
    {
      id: "e2",
      label: "Alternative",
      versions: [
        {
          id: "ev2",
          versionNumber: 1,
          createdAt: new Date("2026-10-02"),
          totalValue: 1000,
          currency: "USD",
          description: "1 capability",
          needsRecalculation: false,
          approvalState: "not_approved" as const,
          approval: null,
        },
      ],
    },
  ];

  it("disables + New estimate (still focusable), explains why, and switches Open to View", () => {
    render(<LockedHarness estimates={estimates} />);
    const newButton = screen.getByRole("button", { name: "+ New estimate" });
    expect(newButton).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Locked — the client approved v1 on 18 Oct 2026"
    );
    expect(screen.queryByText("Open →")).not.toBeInTheDocument();
    expect(screen.getAllByText("View →")).toHaveLength(2);
    expect(
      screen.getAllByRole("img", { name: "Document status: Not approved" }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("img", { name: "Document status: Client approved · 18 Oct 2026" }).length
    ).toBeGreaterThan(0);
  });
});

function LockedHarness({
  estimates,
}: {
  estimates: React.ComponentProps<typeof EstimatesListPanel>["estimates"];
}) {
  return (
    <EstimatesListPanel
      projectId="p1"
      estimates={estimates}
      rateCardOptions={[]}
      lock={{ versionNumber: 1, clientApprovedOn: "2026-10-18" }}
    />
  );
}

describe("LockedNotice", () => {
  it("states the version, date and change-request path", () => {
    render(<LockedNotice versionNumber={2} clientApprovedOn="2026-10-18" />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Locked — the client approved v2 on 18 Oct 2026. Changes will be handled through change requests (coming soon)."
    );
  });
});
