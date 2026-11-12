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
const { removeItemsCoveredByKeyDetails } =
  await import("@/services/agents/position-key-detail-filter");
const { runIntakeAgent } = await import("@/services/agents/intake-agent");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const items = [
  { topic: "Secondary benefit sought", detail: "Capture more first-party data." },
  { topic: "Brand background", detail: "Fizzy is a drinks brand." },
  { topic: "Approach", detail: "A lean pilot first." },
];
const keyDetails =
  "- Objective: Objective: Drive more purchases; capture more first-party data\n- Scope: Scope: A lean pilot first";

beforeEach(() => {
  mockParse.mockReset();
});

describe("removeItemsCoveredByKeyDetails", () => {
  it("removes exactly the items the key details already cover, keeping the rest in order", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: { coveredIndexes: [0, 2] } });

    const result = await removeItemsCoveredByKeyDetails(items, keyDetails);

    expect(result).toEqual([{ topic: "Brand background", detail: "Fizzy is a drinks brand." }]);
    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("<key_details>");
    expect(prompt).toContain("0. Secondary benefit sought: Capture more first-party data.");
    expect(prompt).toMatch(/If an item adds anything the recorded values don't contain, do NOT mark it/);
    // Only items about a key detail can go — brand, audience, background etc. always stay.
    expect(prompt).toMatch(/Never mark an item about anything else — brand or client name, audience, background/);
    for (const label of ["Budget", "Objective", "Timeline and Key Milestones", "Client Contact"]) {
      expect(prompt).toContain(label);
    }
  });

  it("keeps every item if the check fails — nothing is ever lost", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));
    expect(await removeItemsCoveredByKeyDetails(items, keyDetails)).toEqual(items);
  });

  it("ignores out-of-range indexes", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: { coveredIndexes: [7, -1] } });
    expect(await removeItemsCoveredByKeyDetails(items, keyDetails)).toEqual(items);
  });

  it("makes no call when there are no key details or no items", async () => {
    expect(await removeItemsCoveredByKeyDetails(items, "")).toEqual(items);
    expect(await removeItemsCoveredByKeyDetails([], keyDetails)).toEqual([]);
    expect(mockParse).not.toHaveBeenCalled();
  });
});

describe("runIntakeAgent — each key detail recorded once (FB-009)", () => {
  it("tells the Scope summary to leave the key details out, and runs no Position Document de-dup", async () => {
    mockParse
      .mockResolvedValueOnce({ parsed_output: { briefType: "EMAIL", summary: "A brief." } })
      .mockResolvedValueOnce({ parsed_output: { facts: [] } })
      .mockResolvedValueOnce({
        parsed_output: {
          context: "Fizzy wants real-time offers.",
          outOfScope: [],
          deliverables: [],
          constraints: [],
          assumptions: [],
          openQuestions: [],
        },
      })
      .mockResolvedValueOnce({ parsed_output: { subject: "Hi", bodyText: "Hello," } });

    const result = await runIntakeAgent("brief text");

    expect(mockParse).toHaveBeenCalledTimes(4);
    const scopePrompt = mockParse.mock.calls[2][0].messages[0].content as string;
    expect(scopePrompt).toMatch(/tracked separately/);
    expect(result.scopeSummary.context).toBe("Fizzy wants real-time offers.");
  });
});
