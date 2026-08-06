import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { config } from "dotenv";
import "@testing-library/jest-dom/vitest";

config({ path: ".env.local" });

afterEach(cleanup);
