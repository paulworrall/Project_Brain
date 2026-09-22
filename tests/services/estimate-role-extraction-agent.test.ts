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
const { extractRolesFromCapabilityInput, EstimateRoleExtractionError } = await import(
  "@/services/agents/estimate-role-extraction-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const extractedRoles = [
  {
    rawRoleText: "2x Developer, 5 days each",
    extractedRole: "Developer",
    extractedLevel: null,
    quantity: 10,
    unit: "days",
  },
];

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractRolesFromCapabilityInput", () => {
  it("returns the parsed extracted role lines", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: extractedRoles });

    const result = await extractRolesFromCapabilityInput(
      "We need 2 developers for 5 days each.",
      "TECH_AND_DATA"
    );

    expect(result).toEqual(extractedRoles);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("2 developers for 5 days each");
    expect(callArgs.messages[0].content).toContain("Tech & Data");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      extractRolesFromCapabilityInput("content", "TECH_AND_DATA")
    ).rejects.toThrow(EstimateRoleExtractionError);
  });

  it("wraps unexpected errors in a friendly EstimateRoleExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      extractRolesFromCapabilityInput("content", "TECH_AND_DATA")
    ).rejects.toThrow(EstimateRoleExtractionError);
  });
});
