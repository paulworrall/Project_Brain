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

type Fact = {
  attributeId: string;
  subFieldId: string;
  value: string;
  date?: string | null;
  evidence?: string | null;
};
function facts(...items: Fact[]) {
  return {
    facts: items.map(({ attributeId, subFieldId, ...rest }) => ({
      field: `${attributeId}.${subFieldId}`,
      date: null,
      evidence: null,
      ...rest,
    })),
  };
}

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractKeyAttributes", () => {
  it("uses one small, flat schema — a list of facts — whatever the number of attributes", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: facts() });
    await extractKeyAttributes("A brief.", "brief");

    // Regression guard: one nested object per attribute made the compiled
    // grammar too large for the API (400 "compiled grammar is too large").
    const schema = mockParse.mock.calls[0][0].output_config.format.schema;
    expect(Object.keys(schema.properties)).toEqual(["facts"]);
    for (const attribute of BRIEF_ATTRIBUTES) {
      expect(schema.properties).not.toHaveProperty(attribute.id);
    }
    expect(JSON.stringify(schema).length).toBeLessThan(4000);
  });

  it("lists every configured attribute and sub-field id for the model, derived from the config", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: facts() });
    await extractKeyAttributes("A brief.", "brief");

    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    for (const attribute of BRIEF_ATTRIBUTES) {
      for (const subField of attribute.subFields) {
        expect(prompt).toContain(`${attribute.id}.${subField.id}`);
      }
    }
    expect(prompt).toMatch(/never guess/i);
    // Several stated objectives belong in the one Objective, not separate records.
    expect(prompt).toMatch(/combine/i);
  });

  it("groups facts by attribute, normalized, with evidence — and leaves out attributes not mentioned", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: facts(
        {
          attributeId: "budget",
          subFieldId: "amount",
          value: " £50,000 ",
          evidence: "Budget: £50,000",
        },
        { attributeId: "budget", subFieldId: "currency", value: "gbp", evidence: "Budget: £50,000" }
      ),
    });

    const result = await extractKeyAttributes("Budget: £50,000", "update");

    expect(Object.keys(result)).toEqual(["budget"]);
    expect(result.budget).toEqual({
      values: { amount: "£50,000", currency: "GBP" },
      evidence: "Budget: £50,000",
    });
  });

  it("collects milestone facts into the milestone list", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: facts(
        { attributeId: "timeline", subFieldId: "startDate", value: "2026-10-01" },
        { attributeId: "timeline", subFieldId: "milestones", value: "Beta", date: "2026-11-01" },
        { attributeId: "timeline", subFieldId: "milestones", value: "Launch", date: null }
      ),
    });

    const result = await extractKeyAttributes("text", "brief");

    expect(result.timeline.values).toEqual({
      startDate: "2026-10-01",
      endDate: null,
      milestones: [
        { name: "Beta", date: "2026-11-01" },
        { name: "Launch", date: null },
      ],
    });
  });

  it("ignores unknown attribute or sub-field ids and drops badly formatted values", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: facts(
        { attributeId: "notAThing", subFieldId: "x", value: "y" },
        { attributeId: "budget", subFieldId: "vibes", value: "good" },
        { attributeId: "timeline", subFieldId: "startDate", value: "October" },
        { attributeId: "timeline", subFieldId: "endDate", value: "2026-12-15" }
      ),
    });

    const result = await extractKeyAttributes("text", "brief");

    expect(Object.keys(result)).toEqual(["timeline"]);
    expect(result.timeline.values).toMatchObject({ startDate: null, endDate: "2026-12-15" });
  });

  it("wraps failures in a friendly KeyAttributeExtractionError that keeps the cause", async () => {
    const apiError = new Error("400 compiled grammar is too large");
    mockParse.mockRejectedValueOnce(apiError);
    const failure = await extractKeyAttributes("text", "brief").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KeyAttributeExtractionError);
    expect((failure as InstanceType<typeof KeyAttributeExtractionError>).cause).toBe(apiError);

    mockParse.mockResolvedValueOnce({ parsed_output: null });
    await expect(extractKeyAttributes("text", "brief")).rejects.toThrow(
      KeyAttributeExtractionError
    );
  });
});
