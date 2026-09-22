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
const { parseRateCardLineItems, RateCardLineItemAgentError } = await import(
  "@/services/agents/rate-card-line-item-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const lineItems = [
  { role: "Developer", level: "Junior", rateType: "DAILY" as const, rate: 400, currency: "GBP" },
  { role: "Developer", level: "Senior", rateType: "DAILY" as const, rate: 700, currency: "GBP" },
];

beforeEach(() => {
  mockParse.mockReset();
});

describe("parseRateCardLineItems", () => {
  it("returns the parsed structured line items", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: lineItems });

    const result = await parseRateCardLineItems("Developer, Junior: £400/day\nDeveloper, Senior: £700/day");

    expect(result).toEqual(lineItems);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("£400/day");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(parseRateCardLineItems("content")).rejects.toThrow(RateCardLineItemAgentError);
  });

  it("wraps unexpected errors in a friendly RateCardLineItemAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(parseRateCardLineItems("content")).rejects.toThrow(RateCardLineItemAgentError);
  });
});
