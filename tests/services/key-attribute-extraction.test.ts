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
const { extractKeyAttributes, KeyAttributeExtractionError } =
  await import("@/services/agents/key-attribute-extraction");
const { BRIEF_ATTRIBUTES } = await import("@/lib/briefAttributes");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

function allNull(overrides: Record<string, unknown> = {}) {
  return { ...Object.fromEntries(BRIEF_ATTRIBUTES.map((a) => [a.id, null])), ...overrides };
}

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractKeyAttributes", () => {
  it("asks for every configured attribute and sub-field, derived from the config", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: allNull() });
    await extractKeyAttributes("A brief.", "brief");

    // The SDK hoists nested objects into $defs, so check the whole schema.
    const schema = mockParse.mock.calls[0][0].output_config.format.schema;
    const serialized = JSON.stringify(schema);
    for (const attribute of BRIEF_ATTRIBUTES) {
      expect(Object.keys(schema.properties)).toContain(attribute.id);
      for (const subField of attribute.subFields) {
        expect(serialized).toContain(`"${subField.id}"`);
      }
    }
    expect(mockParse.mock.calls[0][0].messages[0].content).toMatch(/never guess/i);
  });

  it("returns only the attributes the text mentions, normalized, with evidence", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: allNull({
        budget: { amount: " £50,000 ", currency: "gbp", evidence: "Budget: £50,000" },
        clientContact: { name: null, role: null, email: null, evidence: null },
      }),
    });

    const result = await extractKeyAttributes("Budget: £50,000", "update");

    expect(Object.keys(result)).toEqual(["budget"]);
    expect(result.budget).toEqual({
      values: { amount: "£50,000", currency: "GBP" },
      evidence: "Budget: £50,000",
    });
  });

  it("drops a badly formatted value rather than the whole attribute", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: allNull({
        timeline: {
          startDate: "October",
          endDate: "2026-12-15",
          milestones: [{ name: "Beta", date: "2026-11-01" }],
          evidence: "Start October, finish by 15 Dec",
        },
      }),
    });

    const result = await extractKeyAttributes("Start October, finish by 15 Dec", "brief");

    expect(result.timeline.values).toEqual({
      startDate: null,
      endDate: "2026-12-15",
      milestones: [{ name: "Beta", date: "2026-11-01" }],
    });
  });

  it("wraps failures in a friendly KeyAttributeExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));
    await expect(extractKeyAttributes("text", "brief")).rejects.toThrow(
      KeyAttributeExtractionError
    );

    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(extractKeyAttributes("text", "brief")).rejects.toThrow(
      KeyAttributeExtractionError
    );
  });
});
