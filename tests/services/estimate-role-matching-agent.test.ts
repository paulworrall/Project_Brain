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
const { matchRolesAgainstRateCard, EstimateRoleMatchingError } = await import(
  "@/services/agents/estimate-role-matching-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const extractedRoles = [
  {
    rawRoleText: "Senior Developer, 5 days",
    extractedRole: "Developer",
    extractedLevel: "Senior",
    extractedCapability: "TECH_AND_DATA" as const,
    quantity: 5,
    unit: "days" as const,
    rawUnitText: "days",
  },
];

const candidateLines = [
  { id: "line_junior", role: "Developer", level: "Junior" },
  { id: "line_senior", role: "Developer", level: "Senior" },
];

const matchResults = [
  {
    rawRoleText: "Senior Developer, 5 days",
    matchType: "ROLE_AND_LEVEL" as const,
    confidence: 0.95,
    suggestedRateCardLineId: "line_senior",
  },
];

beforeEach(() => {
  mockParse.mockReset();
});

describe("matchRolesAgainstRateCard", () => {
  it("returns the agent's raw match judgment, unmodified", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: matchResults });

    const result = await matchRolesAgainstRateCard(extractedRoles, candidateLines);

    expect(result).toEqual(matchResults);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("Senior Developer, 5 days");
    expect(callArgs.messages[0].content).toContain("line_senior");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      matchRolesAgainstRateCard(extractedRoles, candidateLines)
    ).rejects.toThrow(EstimateRoleMatchingError);
  });

  it("wraps unexpected errors in a friendly EstimateRoleMatchingError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      matchRolesAgainstRateCard(extractedRoles, candidateLines)
    ).rejects.toThrow(EstimateRoleMatchingError);
  });
});
