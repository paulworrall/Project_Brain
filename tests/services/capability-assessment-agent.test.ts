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
const { assessCapabilities, CapabilityAssessmentError } = await import(
  "@/services/agents/capability-assessment-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const assessment = {
  suggestions: [
    {
      capability: "TECH_AND_DATA" as const,
      rationale: "The brief mentions integrating with the client's CRM.",
    },
  ],
  isLowConfidence: false,
  lowConfidenceReason: null,
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("assessCapabilities", () => {
  it("returns the parsed suggestions, never selecting outside the fixed list implicitly (schema-enforced)", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: assessment });

    const result = await assessCapabilities("Some brief content");

    expect(result).toEqual(assessment);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("Some brief content");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(assessCapabilities("thin brief")).rejects.toThrow(CapabilityAssessmentError);
  });

  it("wraps unexpected errors in a friendly CapabilityAssessmentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(assessCapabilities("thin brief")).rejects.toThrow(CapabilityAssessmentError);
  });
});
