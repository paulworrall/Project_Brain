import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return { default: Object.assign(MockAnthropic, { RateLimitError, APIError }) };
});

const Anthropic = (await import("@anthropic-ai/sdk")).default;
const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { AssistantClassifierError, classifyAssistantMessage, normaliseIntent } =
  await import("@/services/agents/assistant-classifier");

beforeEach(() => mockParse.mockReset());

describe("classifyAssistantMessage", () => {
  it.each([
    [{ intent: "question", question: "What's the budget?", update: null }],
    [{ intent: "update", question: null, update: "Budget is now £60k." }],
    [{ intent: "both", question: "Over the cap?", update: "Budget is now £60k." }],
    [{ intent: "unclear", question: null, update: null }],
  ])("returns the structured intent %o", async (parsed) => {
    mockParse.mockResolvedValueOnce({ parsed_output: parsed });
    const result = await classifyAssistantMessage("…");
    expect(result.intent).toBe(parsed.intent);
  });

  it("asks for structured output and never answers", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { intent: "question", question: "Q", update: null },
    });
    await classifyAssistantMessage("What's the budget?");
    const request = mockParse.mock.calls[0][0];
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content).toContain("Never answer the question yourself.");
  });

  it("wraps API failures in a user-friendly error", async () => {
    mockParse.mockRejectedValueOnce(
      new (Anthropic.RateLimitError as unknown as new (m: string) => Error)("slow down")
    );
    await expect(classifyAssistantMessage("x")).rejects.toThrow(/rate-limited/);
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(classifyAssistantMessage("x")).rejects.toBeInstanceOf(AssistantClassifierError);
  });
});

describe("normaliseIntent", () => {
  it("falls back to the whole message when a part is missing", () => {
    expect(normaliseIntent({ intent: "question", question: null, update: null }, "msg")).toEqual({
      intent: "question",
      question: "msg",
      update: null,
    });
    expect(normaliseIntent({ intent: "update", question: null, update: " " }, "msg")).toEqual({
      intent: "update",
      question: null,
      update: "msg",
    });
  });

  it("treats an unknown intent as unclear (the output format doesn't enforce enums)", () => {
    expect(normaliseIntent({ intent: "maybe", question: "Q", update: "U" }, "msg").intent).toBe(
      "unclear"
    );
    expect(
      normaliseIntent({ intent: " Question ", question: "Q", update: null }, "msg").intent
    ).toBe("question");
  });

  it("downgrades a 'both' with one part missing, and with none to unclear", () => {
    expect(normaliseIntent({ intent: "both", question: "Q", update: null }, "msg").intent).toBe(
      "question"
    );
    expect(normaliseIntent({ intent: "both", question: null, update: "U" }, "msg").intent).toBe(
      "update"
    );
    expect(normaliseIntent({ intent: "both", question: null, update: null }, "msg").intent).toBe(
      "unclear"
    );
  });
});
