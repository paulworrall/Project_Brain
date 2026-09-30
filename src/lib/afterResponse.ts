import { after } from "next/server";

/**
 * Runs work after the response has been sent (Next's after(), kept alive on
 * Vercel), so optional AI steps — e.g. an update's one-line summary — never
 * slow down or block the save. The task must handle its own errors. Tests
 * swap this module for a queue (tests/setup.ts).
 */
export function runAfterResponse(task: () => Promise<void>): void {
  after(task);
}
