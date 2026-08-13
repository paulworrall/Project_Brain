import type { Session } from "next-auth";

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
