import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return {
    default: Object.assign(MockAnthropic, { RateLimitError, APIError }),
  };
});

const { anthropic } = await import("@/lib/anthropic");
const { summariseUpdate, UpdateSummaryError } = await import("@/services/agents/update-summary");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockParse.mockReset();
});

describe("summariseUpdate", () => {
  it("returns a one-line summary as structured output, with a request timeout", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { summary: "Client moved the launch to March and raised the budget." },
    });

    const summary = await summariseUpdate("Launch is now March; budget up to £120k.");

    expect(summary).toBe("Client moved the launch to March and raised the budget.");
    const [params, options] = mockParse.mock.calls[0];
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.messages[0].content).toContain("Launch is now March");
    expect(options?.timeout).toBeGreaterThan(0);
  });

  it("collapses a multi-line answer to one line", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: { summary: "  Budget up.\nNew milestone.  " } });
    expect(await summariseUpdate("…")).toBe("Budget up. New milestone.");
  });

  it("throws a friendly error when Claude returns nothing", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(summariseUpdate("…")).rejects.toThrow(UpdateSummaryError);
  });

  it("wraps any other failure", async () => {
    mockParse.mockRejectedValueOnce(new Error("timed out"));
    await expect(summariseUpdate("…")).rejects.toThrow(UpdateSummaryError);
  });
});
