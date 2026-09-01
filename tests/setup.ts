import { afterEach } from "vitest";
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
