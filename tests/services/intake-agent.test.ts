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
  generateClarificationEmail,
  generateSetupChecklist,
  runIntakeAgent,
  IntakeAgentError,
} = await import("@/services/agents/intake-agent");
const { DEFAULT_SETUP_CHECKLIST_ITEMS } = await import("@/types/intake");
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
      whatWeNeedToFindOut: ["Target audience"],
      clientFlaggedOpenItems: ["Budget"],
    };
    mockParse.mockResolvedValueOnce({ parsed_output: fields });

    const result = await extractPositionFields("brief text", "EMAIL");

    expect(result).toEqual(fields);
  });

  it("keeps every key detail out of 'whatWeKnow' — they're recorded once, as key details", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { whatWeKnow: [], whatWeNeedToFindOut: [], clientFlaggedOpenItems: [] },
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
    expect(Object.keys(call.output_config.format.schema.properties)).toEqual([
      "whatWeKnow",
      "whatWeNeedToFindOut",
      "clientFlaggedOpenItems",
    ]);
  });
});

describe("generateClarificationEmail", () => {
  it("returns the parsed email draft, addressed to the contact it's given", async () => {
    const email = { subject: "Quick questions", bodyText: "Hi Jamie," };
    mockParse.mockResolvedValueOnce({ parsed_output: email });

    const result = await generateClarificationEmail(
      { whatWeKnow: [], whatWeNeedToFindOut: ["Target audience"], clientFlaggedOpenItems: [] },
      {},
      "Jamie Chen"
    );

    expect(result).toEqual(email);
    expect(mockParse.mock.calls[0][0].messages[0].content).toContain("Address it to Jamie Chen");
  });
});

describe("generateSetupChecklist", () => {
  it("returns the fixed checklist without calling Claude", () => {
    const result = generateSetupChecklist();

    expect(result.items).toEqual([...DEFAULT_SETUP_CHECKLIST_ITEMS]);
    expect(mockParse).not.toHaveBeenCalled();
  });
});

const emptyPosition = { whatWeKnow: [], whatWeNeedToFindOut: [], clientFlaggedOpenItems: [] };

function queueIntake(keyFacts: unknown = { facts: [] }) {
  mockParse
    .mockResolvedValueOnce({ parsed_output: { briefType: "PDF", summary: "A brief." } })
    .mockResolvedValueOnce({ parsed_output: keyFacts })
    .mockResolvedValueOnce({ parsed_output: emptyPosition })
    .mockResolvedValueOnce({ parsed_output: { subject: "Hi", bodyText: "Hello," } });
}

describe("runIntakeAgent", () => {
  it("runs classify -> key details -> Position Document -> email, and returns the key details", async () => {
    queueIntake({
      facts: [
        { field: "objective.objective", value: "Drive more frequent purchases", date: null, evidence: null },
        { field: "clientContact.name", value: "Jamie Chen", date: null, evidence: null },
      ],
    });

    const result = await runIntakeAgent("brief text");

    expect(mockParse).toHaveBeenCalledTimes(4);
    const prompts = mockParse.mock.calls.map((call) => call[0].messages[0].content as string);
    expect(prompts[0]).toMatch(/Classify this client brief/);
    expect(prompts[1]).toMatch(/key details/);
    expect(prompts[2]).toMatch(/captured separately/);
    // The email is addressed to the contact the key details found.
    expect(prompts[3]).toContain("Address it to Jamie Chen");

    expect(result.classification.briefType).toBe("PDF");
    expect(result.keyAttributes?.objective.values.objective).toBe("Drive more frequent purchases");
    expect(result.keyAttributesError).toBeNull();
    expect(result.checklist.items).toEqual([...DEFAULT_SETUP_CHECKLIST_ITEMS]);
  });

  it("never lets a key-detail failure block intake — it's returned for the caller to record", async () => {
    mockParse
      .mockResolvedValueOnce({ parsed_output: { briefType: "PDF", summary: "A brief." } })
      .mockRejectedValueOnce(new Error("400 compiled grammar is too large"))
      .mockResolvedValueOnce({ parsed_output: emptyPosition })
      .mockResolvedValueOnce({ parsed_output: { subject: "Hi", bodyText: "Hello," } });

    const result = await runIntakeAgent("brief text");

    expect(result.keyAttributes).toBeNull();
    expect(result.keyAttributesError).toMatch(/key details/i);
    expect(result.clarificationEmail.subject).toBe("Hi");
    expect(mockParse.mock.calls[3][0].messages[0].content).toContain("Address it to the client contact");
  });
});

describe("runIntakeAgent — PM perspective", () => {
  const pmPerspective = {
    initialThoughts: "PM_CONTEXT_MARKER: the client was burned by their last agency.",
    proposedSolution: "PM_SOLUTION_MARKER: a phased rollout",
  };

  it("gives the Position Document and clarification email the PM perspective as its own labelled block, separate from the brief", async () => {
    queueIntake();
    await runIntakeAgent("CLIENT_BRIEF_MARKER", pmPerspective);

    const [classifyPrompt, keyDetailsPrompt, positionPrompt, emailPrompt] = mockParse.mock.calls.map(
      (call) => call[0].messages[0].content as string
    );

    // Classification and key details come from the brief alone — no PM view.
    expect(classifyPrompt).not.toContain("PM_CONTEXT_MARKER");
    expect(keyDetailsPrompt).toContain("CLIENT_BRIEF_MARKER");
    expect(keyDetailsPrompt).not.toContain("PM_CONTEXT_MARKER");

    for (const prompt of [positionPrompt, emailPrompt]) {
      expect(prompt).toContain("<pm_perspective>");
      expect(prompt).toContain("PM_CONTEXT_MARKER");
      expect(prompt).toMatch(/never present anything in it as something the client said/i);
    }
    // The PM's words sit in their own block, never inside the brief.
    const briefBlock = positionPrompt.slice(
      positionPrompt.indexOf("<brief>"),
      positionPrompt.indexOf("</brief>")
    );
    expect(briefBlock).toContain("CLIENT_BRIEF_MARKER");
    expect(briefBlock).not.toContain("PM_CONTEXT_MARKER");
    // "What we know" must stay limited to what the client said.
    expect(positionPrompt).toMatch(/whatWeKnow.*only what the brief itself states/i);
  });

  it("sends no PM block at all when the PM perspective is empty", async () => {
    queueIntake();
    await runIntakeAgent("brief text", {});

    for (const call of mockParse.mock.calls) {
      expect(call[0].messages[0].content).not.toContain("<pm_perspective>");
    }
  });
});
