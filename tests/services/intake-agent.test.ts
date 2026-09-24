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
      primaryContactName: "Jamie Chen",
      primaryContactEmail: "jamie@example.com",
      whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
      whatWeNeedToFindOut: ["Target audience"],
      clientFlaggedOpenItems: ["Budget"],
    };
    mockParse.mockResolvedValueOnce({ parsed_output: fields });

    const result = await extractPositionFields("brief text", "EMAIL");

    expect(result).toEqual(fields);
  });
});

describe("generateClarificationEmail", () => {
  it("returns the parsed email draft", async () => {
    const email = { subject: "Quick questions", bodyText: "Hi Jamie," };
    mockParse.mockResolvedValueOnce({ parsed_output: email });

    const result = await generateClarificationEmail({
      primaryContactName: "Jamie Chen",
      primaryContactEmail: null,
      whatWeKnow: [],
      whatWeNeedToFindOut: ["Target audience"],
      clientFlaggedOpenItems: [],
    });

    expect(result).toEqual(email);
  });
});

describe("generateSetupChecklist", () => {
  it("returns the fixed checklist without calling Claude", () => {
    const result = generateSetupChecklist();

    expect(result.items).toEqual([...DEFAULT_SETUP_CHECKLIST_ITEMS]);
    expect(mockParse).not.toHaveBeenCalled();
  });
});

describe("runIntakeAgent", () => {
  it("orchestrates classify -> extract -> email in sequence and combines the result", async () => {
    mockParse
      .mockResolvedValueOnce({
        parsed_output: { briefType: "PDF", summary: "A brand refresh brief." },
      })
      .mockResolvedValueOnce({
        parsed_output: {
          primaryContactName: null,
          primaryContactEmail: null,
          whatWeKnow: [],
          whatWeNeedToFindOut: [],
          clientFlaggedOpenItems: [],
        },
      })
      .mockResolvedValueOnce({
        parsed_output: { subject: "Following up", bodyText: "Hello," },
      });

    const result = await runIntakeAgent("brief text");

    expect(mockParse).toHaveBeenCalledTimes(3);
    expect(result.classification.briefType).toBe("PDF");
    expect(result.clarificationEmail.subject).toBe("Following up");
    expect(result.checklist.items).toEqual([...DEFAULT_SETUP_CHECKLIST_ITEMS]);
  });
});

describe("runIntakeAgent — PM perspective", () => {
  const pmPerspective = {
    context: "PM_CONTEXT_MARKER: the client was burned by their last agency.",
    earlyKpis: "PM_KPI_MARKER: 20% more monthly actives",
  };
  const emptyPosition = {
    primaryContactName: null,
    primaryContactEmail: null,
    whatWeKnow: [],
    whatWeNeedToFindOut: [],
    clientFlaggedOpenItems: [],
  };

  function queueIntake() {
    mockParse
      .mockResolvedValueOnce({ parsed_output: { briefType: "PDF", summary: "A brief." } })
      .mockResolvedValueOnce({ parsed_output: emptyPosition })
      .mockResolvedValueOnce({ parsed_output: { subject: "Hi", bodyText: "Hello," } });
  }

  it("gives the Position Document and clarification email the PM perspective as its own labelled block, separate from the brief", async () => {
    queueIntake();
    await runIntakeAgent("CLIENT_BRIEF_MARKER", pmPerspective);

    const [classifyPrompt, positionPrompt, emailPrompt] = mockParse.mock.calls.map(
      (call) => call[0].messages[0].content as string
    );

    // Classification is about the brief document itself — no PM view.
    expect(classifyPrompt).not.toContain("PM_CONTEXT_MARKER");

    for (const prompt of [positionPrompt, emailPrompt]) {
      expect(prompt).toContain("<pm_perspective>");
      expect(prompt).toContain("PM_CONTEXT_MARKER");
      expect(prompt).toMatch(/never present anything in it as something the client said/i);
    }
    // The PM's words sit in their own block, never inside the brief.
    const briefBlock = positionPrompt.slice(positionPrompt.indexOf("<brief>"), positionPrompt.indexOf("</brief>"));
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
