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
const { generateEstimateBriefContent, EstimateBriefAgentError } = await import(
  "@/services/agents/estimate-brief-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const briefContent = {
  projectOverview: {
    context: "A campaign refresh for a coffee client.",
    whatIsKnown: ["Objective: refresh the campaign"],
    timeline: "Q4 2026",
    constraints: ["UK market only"],
  },
  capabilitySections: [
    {
      capability: "TECH_AND_DATA" as const,
      whatIsExpected: ["Confirm CRM integration effort"],
    },
  ],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("generateEstimateBriefContent", () => {
  it("returns the parsed brief content, one section per confirmed capability", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: briefContent });

    const result = await generateEstimateBriefContent("Some brief context", ["TECH_AND_DATA"]);

    expect(result).toEqual(briefContent);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("Some brief context");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      generateEstimateBriefContent("context", ["TECH_AND_DATA"])
    ).rejects.toThrow(EstimateBriefAgentError);
  });

  it("wraps unexpected errors in a friendly EstimateBriefAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      generateEstimateBriefContent("context", ["TECH_AND_DATA"])
    ).rejects.toThrow(EstimateBriefAgentError);
  });
});
