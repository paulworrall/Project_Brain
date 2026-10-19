import { afterEach, vi } from "vitest";
import { afterResponseQueue } from "./helpers/afterResponse";
import { cleanup } from "@testing-library/react";
import { config } from "dotenv";
import "@testing-library/jest-dom/vitest";

config({ path: ".env.local" });

afterEach(cleanup);

// jsdom doesn't implement matchMedia — polyfill it for component tests
// (e.g. usePrefersReducedMotion) so any component that checks it doesn't
// crash. Only relevant in jsdom-environment test files ("node" is the
// default per vitest.config.mts), so guard on `window` existing.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Work the app defers until after the response (runAfterResponse — e.g. an
// update's AI summary) is queued here instead of run: tests that care call
// flushAfterResponse() (tests/helpers/afterResponse.ts); the rest never
// consume mocked Claude responses meant for something else.
vi.mock("@/lib/afterResponse", () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    afterResponseQueue().push(task);
  },
}));
afterEach(() => {
  afterResponseQueue().length = 0;
});

// The approve/undo/revert server actions pull in prisma + auth; component tests
// render ApprovalActions without caring, so they get inert defaults here. Tests
// that exercise them declare their own vi.mock for this module.
vi.mock("@/app/(dashboard)/projects/[projectId]/approval-actions", () => ({
  approveEstimateVersion: vi.fn(),
  approveSowVersion: vi.fn(),
  undoApprovalAction: vi.fn(),
  revertApprovalAction: vi.fn(),
}));

// ApprovalActions calls useRouter(); component tests render without an app router.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) };
});
