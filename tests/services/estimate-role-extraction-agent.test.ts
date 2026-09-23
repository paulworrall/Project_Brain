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
const { extractEstimateRoles, EstimateRoleExtractionError } =
  await import("@/services/agents/estimate-role-extraction-agent");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const extractedRoles = [
  {
    rawRoleText: "2x Developer, 5 days each",
    extractedRole: "Developer",
    extractedLevel: null,
    extractedCapability: "TECH_AND_DATA",
    quantity: 10,
    unit: "days",
    rawUnitText: "days",
  },
];

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractEstimateRoles", () => {
  it("returns the parsed extracted role lines, including a classified capability per role", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: extractedRoles });

    const result = await extractEstimateRoles("We need 2 developers for 5 days each.");

    expect(result).toEqual(extractedRoles);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("2 developers for 5 days each");
    expect(callArgs.messages[0].content).toContain("map_capabilities_reference");
    expect(callArgs.messages[0].content).toContain("Tech & Data");
    expect(callArgs.messages[0].content).toContain("NEVER assume hours");
  });

  it("asks for an explicit, nullable hours/days/weeks unit plus the raw unit text — never a default", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: extractedRoles });

    await extractEstimateRoles("Developer x 3");

    const format = mockParse.mock.calls[0][0].output_config.format;
    const unitSchema = format.schema.items.properties.unit;
    expect(unitSchema.anyOf).toContainEqual({ type: "null" });
    const unitDescription = JSON.stringify(unitSchema);
    expect(unitDescription).toMatch(/'hours', 'days' or 'weeks'/);
    expect(unitDescription).toMatch(/Never assume hours/);
    expect(format.schema.items.required).toContain("rawUnitText");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(extractEstimateRoles("content")).rejects.toThrow(EstimateRoleExtractionError);
  });

  it("wraps unexpected errors in a friendly EstimateRoleExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(extractEstimateRoles("content")).rejects.toThrow(EstimateRoleExtractionError);
  });
});
