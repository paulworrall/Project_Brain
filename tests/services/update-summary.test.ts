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
  it("returns a one-line summary and what changed against what we knew before, with a timeout", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        summary: "Client moved the launch to March and raised the budget.",
        changeSummary: "Budget increased; launch date moved.",
      },
    });

    const result = await summariseUpdate({
      content: "Launch is now March; budget up to £120k.",
      before: "BRIEF_MARKER: budget £100k, launch in February.",
    });

    expect(result).toEqual({
      summary: "Client moved the launch to March and raised the budget.",
      changeSummary: "Budget increased; launch date moved.",
    });
    const [params, options] = mockParse.mock.calls[0];
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.messages[0].content).toContain("Launch is now March");
    expect(params.messages[0].content).toContain("BRIEF_MARKER");
    expect(options?.timeout).toBeGreaterThan(0);
  });

  it("collapses multi-line answers to one line each", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { summary: "  Budget up.\nNew milestone.  ", changeSummary: "Budget\nincreased" },
    });
    expect(await summariseUpdate({ content: "…", before: "…" })).toEqual({
      summary: "Budget up. New milestone.",
      changeSummary: "Budget increased",
    });
  });

  it("throws a friendly error when Claude returns nothing", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(summariseUpdate({ content: "…", before: "…" })).rejects.toThrow(UpdateSummaryError);
  });

  it("wraps any other failure", async () => {
    mockParse.mockRejectedValueOnce(new Error("timed out"));
    await expect(summariseUpdate({ content: "…", before: "…" })).rejects.toThrow(UpdateSummaryError);
  });
});
