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
const { answerQuestionFromContext, ChatbotError } = await import("@/services/agents/chatbot");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockParse.mockReset();
});

describe("answerQuestionFromContext", () => {
  it("returns the parsed answer, calling Claude with only the given context", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { answer: "The budget is confirmed at £120k." },
    });

    const result = await answerQuestionFromContext(
      "## POSITION_DOCUMENT (version 1)\n{\"budget\":\"120k\"}",
      "What's the budget?"
    );

    expect(result).toBe("The budget is confirmed at £120k.");
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("120k");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(answerQuestionFromContext("context", "question")).rejects.toThrow(
      ChatbotError
    );
  });

  it("wraps unexpected errors in a friendly ChatbotError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(answerQuestionFromContext("context", "question")).rejects.toThrow(
      ChatbotError
    );
  });
});
