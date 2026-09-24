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
const { extractClarificationUpdate, ClarificationExtractionError } = await import(
  "@/services/agents/clarification-extraction"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const currentPositionDocument = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: ["Target audience"],
  clientFlaggedOpenItems: ["Budget"],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractClarificationUpdate", () => {
  it("returns the updated Position Document fields from Claude", async () => {
    const updated = {
      ...currentPositionDocument,
      whatWeKnow: [
        ...currentPositionDocument.whatWeKnow,
        { topic: "Audience", detail: "18-30 year olds" },
      ],
      whatWeNeedToFindOut: [],
    };
    mockParse.mockResolvedValueOnce({ parsed_output: updated });

    const result = await extractClarificationUpdate(
      currentPositionDocument,
      "Target audience is 18-30 year olds."
    );

    expect(result).toEqual(updated);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
    expect(callArgs.messages[0].content).toContain("Target audience is 18-30 year olds.");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      extractClarificationUpdate(currentPositionDocument, "some reply")
    ).rejects.toThrow(ClarificationExtractionError);
  });

  it("wraps unexpected errors in a friendly ClarificationExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      extractClarificationUpdate(currentPositionDocument, "some reply")
    ).rejects.toThrow(ClarificationExtractionError);
  });
});

describe("extractClarificationUpdate — PM perspective", () => {
  it("includes the PM perspective as a separately labelled block, never mixed into the client's reply", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: currentPositionDocument });

    await extractClarificationUpdate(currentPositionDocument, "CLIENT_REPLY_MARKER", {
      proposedSolution: "PM_SOLUTION_MARKER: a phased rollout",
    });

    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("<pm_perspective>");
    expect(prompt).toContain("PM_SOLUTION_MARKER");
    expect(prompt).toMatch(/never present anything in it as something the client said/i);
    const replyBlock = prompt.slice(prompt.indexOf("<client_reply>"), prompt.indexOf("</client_reply>"));
    expect(replyBlock).toContain("CLIENT_REPLY_MARKER");
    expect(replyBlock).not.toContain("PM_SOLUTION_MARKER");
  });

  it("sends no PM block when there's no PM perspective", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: currentPositionDocument });
    await extractClarificationUpdate(currentPositionDocument, "reply");
    expect(mockParse.mock.calls[0][0].messages[0].content).not.toContain("<pm_perspective>");
  });
});
