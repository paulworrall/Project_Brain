import { describe, expect, it } from "vitest";
import { deriveApprovalState } from "@/lib/commercial/approvalState";
import {
  ADMIN_ROLES,
  UNDO_GRACE_MS,
  UNDO_WINDOW_MS,
  canApprove,
  canRevertApproval,
  canUndoApproval,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/formatMoney";
import { sowApprovalBlockedReason } from "@/lib/commercial/sowApprovalGate";
import {
  approvalViewFor,
  stageStatusWithApprovals,
  type ProjectApprovals,
} from "@/lib/commercial/approvalViewData";
import { ApproveVersionSchema, RevertApprovalSchema } from "@/types/approvals";
import { formatApprovalDate, lockedMessage } from "@/lib/commercial/approvalCopy";

describe("deriveApprovalState", () => {
  it("is approved whenever the version has an active approval", () => {
    expect(
      deriveApprovalState({
        hasActiveApproval: true,
        isLatestVersion: false,
        projectHasOtherApproval: false,
      })
    ).toBe("approved");
  });
  it("is not_approved when the project approved a different estimate", () => {
    expect(
      deriveApprovalState({
        hasActiveApproval: false,
        isLatestVersion: true,
        projectHasOtherApproval: true,
      })
    ).toBe("not_approved");
  });
  it("is superseded for an older, unapproved version", () => {
    expect(
      deriveApprovalState({
        hasActiveApproval: false,
        isLatestVersion: false,
        projectHasOtherApproval: false,
      })
    ).toBe("superseded");
  });
  it("is draft for the latest unapproved version", () => {
    expect(
      deriveApprovalState({
        hasActiveApproval: false,
        isLatestVersion: true,
        projectHasOtherApproval: false,
      })
    ).toBe("draft");
  });
});

describe("permission helpers", () => {
  const recordedAt = new Date("2026-10-18T10:00:00Z");
  const approval = { recordedByUserId: "u1", recordedAt };

  it("lets any signed-in user approve, and nobody else", () => {
    expect(canApprove({ id: "u1", role: "DELIVERY" })).toBe(true);
    expect(canApprove({ id: "u2", role: "CLIENT_ENGAGEMENT" })).toBe(true);
    expect(canApprove(null)).toBe(false);
  });

  it("lets only the approving user undo, only inside the window (plus grace)", () => {
    const at = (ms: number) => new Date(recordedAt.getTime() + ms);
    expect(canUndoApproval({ id: "u1" }, approval, at(UNDO_WINDOW_MS))).toBe(true);
    expect(canUndoApproval({ id: "u1" }, approval, at(UNDO_WINDOW_MS + UNDO_GRACE_MS))).toBe(true);
    expect(canUndoApproval({ id: "u1" }, approval, at(UNDO_WINDOW_MS + UNDO_GRACE_MS + 1))).toBe(
      false
    );
    expect(canUndoApproval({ id: "u2" }, approval, at(1000))).toBe(false);
    expect(canUndoApproval({ id: "u1" }, { ...approval, revokedAt: at(500) }, at(1000))).toBe(
      false
    );
  });

  it("lets nobody revert until an admin role exists (FB-006)", () => {
    expect(ADMIN_ROLES).toEqual([]);
    expect(canRevertApproval({ id: "u1", role: "DELIVERY" })).toBe(false);
    expect(canRevertApproval({ id: "u2", role: "CLIENT_ENGAGEMENT" })).toBe(false);
  });

  it("lets a configured admin role revert", () => {
    (ADMIN_ROLES as string[]).push("CLIENT_ENGAGEMENT");
    try {
      expect(canRevertApproval({ id: "u2", role: "CLIENT_ENGAGEMENT" })).toBe(true);
      expect(canRevertApproval({ id: "u1", role: "DELIVERY" })).toBe(false);
    } finally {
      (ADMIN_ROLES as string[]).pop();
    }
  });
});

describe("approval input schemas", () => {
  const valid = {
    versionId: "v1",
    clientApprovedOn: "2026-10-18",
    clientApproverName: "  Caroline  ",
  };

  it("trims names and accepts an optional reference", () => {
    const parsed = ApproveVersionSchema.parse({ ...valid, reference: " PO-1 " });
    expect(parsed.clientApproverName).toBe("Caroline");
    expect(parsed.reference).toBe("PO-1");
  });

  it("gives field-level messages, never a generic one", () => {
    const result = ApproveVersionSchema.safeParse({
      versionId: "v1",
      clientApprovedOn: "2999-01-01",
      clientApproverName: " ",
    });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("The approval date can't be in the future.");
    expect(messages).toContain("Enter the client contact who approved.");
  });

  it("requires a revert reason", () => {
    expect(RevertApprovalSchema.safeParse({ approvalId: "a1", reason: "   " }).success).toBe(false);
    expect(
      RevertApprovalSchema.safeParse({ approvalId: "a1", reason: "Client withdrew" }).success
    ).toBe(true);
  });
});

describe("shared helpers", () => {
  it("formats every total the same way", () => {
    expect(formatMoney(45675, "USD")).toBe("45,675.00 USD");
    expect(formatMoney("45675.5", "GBP")).toBe("45,675.50 GBP");
  });

  it("explains why a SOW can't be approved", () => {
    const base = {
      approvedEstimateVersionId: null,
      approvedEstimateVersionNumber: null,
      sowSourceEstimateVersionId: "ev1",
      sowSourceEstimateVersionNumber: 1,
    };
    expect(sowApprovalBlockedReason(base)).toBe("Approve the estimate first.");
    expect(
      sowApprovalBlockedReason({
        ...base,
        approvedEstimateVersionId: "ev2",
        approvedEstimateVersionNumber: 2,
      })
    ).toBe(
      "This SOW was generated from Estimate v1, but v2 is the approved estimate. Regenerate the SOW first."
    );
    expect(
      sowApprovalBlockedReason({
        ...base,
        approvedEstimateVersionId: "ev1",
        approvedEstimateVersionNumber: 1,
      })
    ).toBeNull();
  });

  it("formats dates and the locked copy without timezone drift", () => {
    expect(formatApprovalDate("2026-10-18")).toBe("18 Oct 2026");
    expect(lockedMessage(2, "2026-10-18")).toBe(
      "Locked — the client approved v2 on 18 Oct 2026. Changes will be handled through change requests (coming soon)."
    );
  });

  it("derives stage 6/8 as Complete from approvals, and drops the override on revert", () => {
    const none = { estimate: null, sow: null };
    const doc = { documentType: "ESTIMATE" } as never;
    expect(stageStatusWithApprovals(6, "IN_PROGRESS", none)).toBe("IN_PROGRESS");
    expect(stageStatusWithApprovals(6, "IN_PROGRESS", { estimate: doc, sow: null })).toBe(
      "COMPLETE"
    );
    expect(stageStatusWithApprovals(8, "NOT_STARTED", { estimate: doc, sow: null })).toBe(
      "NOT_STARTED"
    );
    expect(stageStatusWithApprovals(8, "NOT_STARTED", { estimate: null, sow: doc })).toBe(
      "COMPLETE"
    );
    expect(stageStatusWithApprovals(5, "IN_PROGRESS", { estimate: doc, sow: doc })).toBe(
      "IN_PROGRESS"
    );
  });

  it("derives per-version state from the project's approvals", () => {
    const approval = { id: "a1", clientApprovedOn: "2026-10-18" } as never;
    const approvals = {
      summary: { estimate: { approval }, sow: null },
      approvedEstimateVersionId: "ev_approved",
      approvedEstimateId: "e1",
      approvedEstimateVersionNumber: 1,
      approvedSowVersionId: null,
    } as unknown as ProjectApprovals;
    expect(approvalViewFor(approvals, "ESTIMATE", "ev_approved", true).approvalState).toBe(
      "approved"
    );
    expect(approvalViewFor(approvals, "ESTIMATE", "ev_other", true).approvalState).toBe(
      "not_approved"
    );
    expect(approvalViewFor(approvals, "SOW", "sv1", true).approvalState).toBe("draft");
    expect(approvalViewFor(approvals, "SOW", "sv0", false).approvalState).toBe("superseded");
  });
});
