import type { Session } from "next-auth";
import { UNDO_WINDOW_MS } from "@/lib/undoWindow";

/**
 * First real role-enforcement in the app (previously both roles saw
 * identical views — see CLAUDE.md's Authentication Flow section). Scoped
 * narrowly: only writes to Client-level commercial documents (MSAs, Rate
 * Cards) are restricted. This is the actual security boundary — callers
 * must check this server-side in the Server Action itself, not just hide
 * the triggering UI control.
 */
export function isClientEngagement(session: Session | null): boolean {
  return session?.user?.role === "CLIENT_ENGAGEMENT";
}

export const CLIENT_ENGAGEMENT_ONLY_MESSAGE =
  "Only the Client Engagement role can manage commercial documents.";

// ---------------------------------------------------------------------------
// Client-approval permissions (FB-005). EVERY permission decision for approving,
// undoing and reverting estimate/SOW approvals lives here so the platform-wide
// roles review (FB-006) can change the rules in one place. Used both server-side
// (enforcement) and to compute the booleans handed to the UI.
// ---------------------------------------------------------------------------

export interface ApprovalActor {
  id: string;
  role?: string | null;
}

/** How long the approving user can undo, plus a small allowance for network latency. */
export { UNDO_WINDOW_MS };
export const UNDO_GRACE_MS = 2_000;

/**
 * Roles that count as Admin. Empty on purpose: the user model has only
 * CLIENT_ENGAGEMENT and DELIVERY, so nobody can revert an approval until FB-006
 * defines an Admin role. Add it here and the revert action + UI switch on.
 */
export const ADMIN_ROLES: readonly string[] = [];

/** Any signed-in user may record an approval for now (PM/Admin distinction arrives with FB-006). */
export function canApprove(user: ApprovalActor | null | undefined): boolean {
  return !!user?.id;
}

export function isWithinUndoWindow(recordedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - recordedAt.getTime() <= UNDO_WINDOW_MS + UNDO_GRACE_MS;
}

/** Only the approving user, only while the (server-clock) window is open, only while the approval is active. */
export function canUndoApproval(
  user: ApprovalActor | null | undefined,
  approval: { recordedByUserId: string; recordedAt: Date; revokedAt?: Date | null },
  now: Date = new Date()
): boolean {
  return (
    !!user?.id &&
    !approval.revokedAt &&
    user.id === approval.recordedByUserId &&
    isWithinUndoWindow(approval.recordedAt, now)
  );
}

export function canRevertApproval(user: ApprovalActor | null | undefined): boolean {
  return !!user?.role && ADMIN_ROLES.includes(user.role);
}
