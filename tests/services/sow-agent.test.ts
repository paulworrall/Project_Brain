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
const { generateSowContent, SowAgentError } = await import("@/services/agents/sow-agent");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const sowContent = {
  scopeSummary: {
    objectives: ["Deliver a refreshed loyalty app"],
    background: "The client wants to modernize their loyalty programme ahead of Q2 2026.",
  },
  deliverables: ["Points-based rewards system", "Referral programme"],
  services: {
    experienceCreative: { involvement: "Design the rewards UI" },
    business: { involvement: "Not included in this engagement" },
    architecture: { involvement: "Not included in this engagement" },
    techAndData: { involvement: "Build the integration" },
    orchestration: { involvement: "Coordinate the launch" },
    other: { involvement: "Not included in this engagement", label: "Other" },
  },
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
  assumptions: ["UK market only"],
  outOfScope: ["Loyalty programme migration from the legacy platform"],
  risks: ["Target audience still unknown"],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("generateSowContent", () => {
  it("returns the parsed SOW content", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: sowContent });

    const result = await generateSowContent("Some project context", "Some template structure guidance");

    expect(result).toEqual(sowContent);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("Some project context");
    expect(callArgs.messages[0].content).toContain("Some template structure guidance");
    expect(callArgs.messages[0].content).toContain("Never invent a fact");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(generateSowContent("context", "guidance")).rejects.toThrow(SowAgentError);
  });

  it("wraps unexpected errors in a friendly SowAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(generateSowContent("context", "guidance")).rejects.toThrow(SowAgentError);
  });
});
