import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SowItemDto } from "@/lib/sowReview";

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
const { extractSowItems } = await import("@/services/agents/sow-extraction-agent");
const { SowAgentError } = await import("@/services/agents/sow-agent");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const existing: SowItemDto[] = [
  {
    id: "item_a",
    section: "DELIVERABLES",
    text: "Rewards app",
    agentOriginalText: "Rewards app",
    source: "AGENT",
    included: true,
    position: 0,
    isNewSinceLastReview: false,
    pendingAgentSuggestion: null,
    version: 0,
  },
];

beforeEach(() => mockParse.mockReset());

describe("extractSowItems", () => {
  it("first extraction: sends the project context, asks for newItems only, and returns the parsed result", async () => {
    const parsed = { newItems: [{ section: "DELIVERABLES", text: "Rewards app" }], changes: [] };
    mockParse.mockResolvedValueOnce({ parsed_output: parsed });

    const result = await extractSowItems("PROJECT CONTEXT TEXT");

    expect(result).toEqual(parsed);
    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("PROJECT CONTEXT TEXT");
    expect(prompt).toContain("first extraction");
    expect(prompt).not.toContain("<existing_items>");
    // All five sections are described to the agent.
    for (const key of ["DELIVERABLES", "SERVICES", "ASSUMPTIONS", "OUT_OF_SCOPE", "RISKS"]) {
      expect(prompt).toContain(key);
    }
  });

  it("regeneration: passes existing items with their ids and asks only for new items and changes by id", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: { newItems: [], changes: [] } });

    await extractSowItems("context", existing);

    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("<existing_items>");
    expect(prompt).toContain("item_a");
    expect(prompt).toMatch(/return ONLY/i);
  });

  it("wraps failures in a friendly SowAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("boom"));
    await expect(extractSowItems("context")).rejects.toThrow(SowAgentError);
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(extractSowItems("context")).rejects.toThrow(SowAgentError);
  });
});
