/**
 * Client-safe copy of the undo window length (src/lib/permissions.ts is the
 * server's source of truth and owns the grace margin; it imports this).
 */
export const UNDO_WINDOW_MS = 10_000;
