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
const {
  classifyBrief,
  extractPositionFields,
  runIntakeAgent,
  IntakeAgentError,
} = await import("@/services/agents/intake-agent");
const { BRIEF_ATTRIBUTES } = await import("@/lib/briefAttributes");

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockParse.mockReset();
});

describe("classifyBrief", () => {
  it("returns the parsed classification from Claude", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { briefType: "EMAIL", summary: "A summer campaign refresh brief." },
    });

    const result = await classifyBrief("some brief text");

    expect(result).toEqual({ briefType: "EMAIL", summary: "A summer campaign refresh brief." });
    expect(mockParse).toHaveBeenCalledTimes(1);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
  });

  it("throws a friendly IntakeAgentError when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(classifyBrief("some brief text")).rejects.toThrow(IntakeAgentError);
  });

  it("wraps API errors in a friendly IntakeAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(classifyBrief("some brief text")).rejects.toThrow(IntakeAgentError);
  });
});

describe("extractPositionFields", () => {
  it("returns the parsed position document fields", async () => {
    const fields = {
      whatWeKnow: [{ topic: "Audience", detail: "18-34 year olds." }],
      clientFlaggedOpenItems: ["Budget"],
    };
    mockParse.mockResolvedValueOnce({ parsed_output: fields });

    const result = await extractPositionFields("brief text", "EMAIL");

    expect(result).toEqual(fields);
  });

  it("keeps every key detail out of 'whatWeKnow' — they're recorded once, as key details", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { whatWeKnow: [], clientFlaggedOpenItems: [] },
    });

    await extractPositionFields("brief text", "EMAIL");

    const call = mockParse.mock.calls[0][0];
    const prompt = call.messages[0].content as string;
    expect(prompt).toMatch(/captured separately/);
    for (const attribute of BRIEF_ATTRIBUTES) {
      expect(prompt).toContain(attribute.label);
    }
    expect(prompt).toMatch(/secondary objective/);
    // No contact fields in the Position Document any more — Client Contact is a key detail.
    // No AI-generated gaps either — what we need to find out is derived from the key details.
    expect(Object.keys(call.output_config.format.schema.properties)).toEqual([
      "whatWeKnow",
      "clientFlaggedOpenItems",
    ]);
    expect(prompt).not.toContain("whatWeNeedToFindOut");
  });
});

describe("the Intake Agent no longer drafts an email or a checklist (FB-011)", () => {
  it("exports no email or checklist generators", async () => {
    const intake = await import("@/services/agents/intake-agent");
    expect(intake).not.toHaveProperty("generateClarificationEmail");
    expect(intake).not.toHaveProperty("generateSetupChecklist");
    expect(intake).not.toHaveProperty("emailFieldsFromScopeSummary");
  });
});

// FB-009: intake drafts a Scope summary instead of a Position Document.
const emptyScope = {
  context: "A brief.",
  outOfScope: [],
  deliverables: [],
  constraints: [],
  assumptions: [],
  openQuestions: [],
};

function queueIntake(keyFacts: unknown = { facts: [] }) {
  mockParse
    .mockResolvedValueOnce({ parsed_output: { briefType: "PDF", summary: "A brief." } })
    .mockResolvedValueOnce({ parsed_output: keyFacts })
    .mockResolvedValueOnce({ parsed_output: emptyScope });
}

describe("runIntakeAgent", () => {
  it("runs classify -> key details -> Scope summary only, and returns the key details and the Scope summary — no email, no checklist", async () => {
    queueIntake({
      facts: [
        {
          field: "objective.objective",
          value: "Drive more frequent purchases",
          date: null,
          evidence: null,
        },
        { field: "clientContact.name", value: "Jamie Chen", date: null, evidence: null },
      ],
    });

    const result = await runIntakeAgent("brief text");

    expect(mockParse).toHaveBeenCalledTimes(3);
    const prompts = mockParse.mock.calls.map((call) => call[0].messages[0].content as string);
    expect(prompts[0]).toMatch(/Classify this client brief/);
    // FB-009 D: the same call assesses how complete the brief is.
    expect(prompts[0]).toContain('"complete"');
    expect(prompts[0]).toContain('"thin"');
    expect(prompts[1]).toMatch(/key details/);
    expect(prompts[2]).toMatch(/Write the scope summary/);
    expect(prompts[2]).toMatch(/tracked separately/);
    expect(result.classification.briefType).toBe("PDF");
    expect(result.keyAttributes?.objective.values.objective).toBe("Drive more frequent purchases");
    expect(result.keyAttributesError).toBeNull();
    expect(result).not.toHaveProperty("checklist");
    expect(result).not.toHaveProperty("clarificationEmail");
    expect(result.scopeSummary.context).toBe("A brief.");
  });

  it("never lets a key-detail failure block intake — it's returned for the caller to record", async () => {
    mockParse
      .mockResolvedValueOnce({ parsed_output: { briefType: "PDF", summary: "A brief." } })
      .mockRejectedValueOnce(new Error("400 compiled grammar is too large"))
      .mockResolvedValueOnce({ parsed_output: emptyScope });

    const result = await runIntakeAgent("brief text");

    expect(result.keyAttributes).toBeNull();
    expect(result.keyAttributesError).toMatch(/key details/i);
    expect(result.scopeSummary.context).toBe("A brief.");
  });
});

describe("runIntakeAgent — PM perspective", () => {
  const pmPerspective = {
    initialThoughts: "PM_CONTEXT_MARKER: the client was burned by their last agency.",
    proposedSolution: "PM_SOLUTION_MARKER: a phased rollout",
  };

  it("gives the Scope summary the PM perspective as its own labelled block, separate from the brief", async () => {
    queueIntake();
    await runIntakeAgent("CLIENT_BRIEF_MARKER", pmPerspective);

    const [classifyPrompt, keyDetailsPrompt, scopePrompt] = mockParse.mock.calls.map(
      (call) => call[0].messages[0].content as string
    );

    // Classification and key details come from the brief alone — no PM view.
    expect(classifyPrompt).not.toContain("PM_CONTEXT_MARKER");
    expect(keyDetailsPrompt).toContain("CLIENT_BRIEF_MARKER");
    expect(keyDetailsPrompt).not.toContain("PM_CONTEXT_MARKER");

    expect(scopePrompt).toContain("<pm_perspective>");
    expect(scopePrompt).toContain("PM_CONTEXT_MARKER");
    // The PM's words sit in their own block, never inside the brief.
    const briefBlock = scopePrompt.slice(
      scopePrompt.indexOf("<brief>"),
      scopePrompt.indexOf("</brief>")
    );
    expect(briefBlock).toContain("CLIENT_BRIEF_MARKER");
    expect(briefBlock).not.toContain("PM_CONTEXT_MARKER");
    // The summary must reflect what the client said, not the PM's views.
    expect(scopePrompt).toMatch(/never present the PM's views as the client's/i);
  });

  it("sends no PM block at all when the PM perspective is empty", async () => {
    queueIntake();
    await runIntakeAgent("brief text", {});

    for (const call of mockParse.mock.calls) {
      expect(call[0].messages[0].content).not.toContain("<pm_perspective>");
    }
  });
});
