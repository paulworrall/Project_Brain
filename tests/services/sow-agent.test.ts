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

const narrative = {
  scopeSummary: {
    objectives: ["Deliver a refreshed loyalty app"],
    background: "The client wants to modernize their loyalty programme ahead of Q2 2026.",
  },
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
};

const validated = {
  deliverables: ["Points-based rewards system", "Referral programme"],
  services: ["Experience/Creative — design the rewards UI"],
  assumptions: ["UK market only"],
  outOfScope: ["Loyalty programme migration from the legacy platform"],
  risks: ["Target audience still unknown"],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("generateSowContent (composition)", () => {
  it("returns the agent's narrative with the PM-validated lists inserted verbatim", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: narrative });

    const result = await generateSowContent("Some project context", "Some template structure guidance", validated);

    expect(result).toEqual({ ...narrative, ...validated });
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain("Some project context");
    expect(prompt).toContain("Some template structure guidance");
    expect(prompt).toContain("Never invent a fact");
    // The validated scope is given to the agent as context, and it is told not to add to it.
    expect(prompt).toContain("<validated_scope>");
    expect(prompt).toContain("Points-based rewards system");
    expect(prompt).toMatch(/do NOT add, remove or contradict/i);
  });

  it("never lets the model add, drop or reword a validated item — even if it returns its own lists", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        ...narrative,
        deliverables: ["An invented deliverable"],
        services: ["An invented service"],
        assumptions: [],
        outOfScope: ["An invented exclusion"],
        risks: ["An invented risk"],
      },
    });

    const result = await generateSowContent("context", "guidance", validated);

    expect(result.deliverables).toEqual(validated.deliverables);
    expect(result.services).toEqual(validated.services);
    expect(result.assumptions).toEqual(validated.assumptions);
    expect(result.outOfScope).toEqual(validated.outOfScope);
    expect(result.risks).toEqual(validated.risks);
  });

  it("asks the model only for the narrative parts — not for the five reviewed lists", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: narrative });
    await generateSowContent("context", "guidance", validated);

    const schema = JSON.stringify(mockParse.mock.calls[0][0].output_config.format.schema);
    expect(schema).toContain("scopeSummary");
    expect(schema).not.toContain("deliverables");
    expect(schema).not.toContain("outOfScope");
    expect(schema).not.toContain("risks");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(generateSowContent("context", "guidance", validated)).rejects.toThrow(SowAgentError);
  });

  it("wraps unexpected errors in a friendly SowAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(generateSowContent("context", "guidance", validated)).rejects.toThrow(SowAgentError);
  });
});
