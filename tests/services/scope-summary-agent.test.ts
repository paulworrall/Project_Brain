import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return { default: Object.assign(MockAnthropic, { RateLimitError, APIError }) };
});

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { ScopeSummaryAgentError, generateScopeSummary, mergeEarlierDocuments, updateScopeSummary } =
  await import("@/services/agents/scope-summary-agent");
const { ScopeSummaryContentSchema } = await import("@/types/scope");

const v1 = {
  context: "Fizzy wants a summer launch.",
  outOfScope: [],
  deliverables: ["Campaign concept"],
  constraints: [],
  assumptions: [],
  openQuestions: ["Which markets?", "Budget split?"],
};

beforeEach(() => mockParse.mockReset());

describe("scope summary agent", () => {
  it("drafts a structured summary from the brief, normalised, without key details", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { ...v1, deliverables: [" Campaign concept ", ""] },
    });
    const result = await generateScopeSummary("<brief>…</brief>");
    expect(ScopeSummaryContentSchema.parse(result)).toEqual(result);
    expect(result.deliverables).toEqual(["Campaign concept"]);
    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("they are tracked separately");
    expect(mockParse.mock.calls[0][0].output_config.format).toBeDefined();
  });

  it("applies an update and reports which sections changed (answered questions removed)", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        ...v1,
        deliverables: ["Campaign concept", "Social toolkit"],
        openQuestions: ["Budget split?"],
      },
    });
    const { content, changedSections } = await updateScopeSummary(
      v1,
      "UK launches first; add a social toolkit.",
      "ctx"
    );
    expect(content.openQuestions).toEqual(["Budget split?"]);
    expect(changedSections).toEqual(["Deliverables", "Open questions"]);
    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Remove any open question the new information answers");
    expect(prompt).toContain("UK launches first");
  });

  it("merges earlier documents into v1", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: v1 });
    await mergeEarlierDocuments("## Position Document (v2)\n{}", "ctx");
    expect(mockParse.mock.calls[0][0].messages[0].content).toContain("## Position Document (v2)");
  });

  it("wraps failures in a friendly error", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(generateScopeSummary("x")).rejects.toBeInstanceOf(ScopeSummaryAgentError);
    mockParse.mockRejectedValueOnce(new Error("boom"));
    await expect(generateScopeSummary("x")).rejects.toThrow(
      /Something went wrong during drafting the scope summary/
    );
  });
});
