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
const { generateDraftScopeDocument, TriageAgentError } = await import(
  "@/services/agents/triage-agent"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const positionDocument = {
  primaryContactName: "Jamie Chen",
  primaryContactEmail: "jamie@example.com",
  whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }],
  whatWeNeedToFindOut: ["Success metrics"],
  clientFlaggedOpenItems: ["Creative direction"],
};

const draftScope = {
  objectives: ["Refresh the campaign"],
  deliverables: ["Creative assets"],
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: {
    contacts: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
    capabilities: ["Creative"],
  },
  budget: { summary: "Not yet confirmed", isConfirmed: false },
  assumptionsAndConstraints: ["Assumed UK market only"],
  flaggedGaps: ["Success metrics", "Creative direction"],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("generateDraftScopeDocument", () => {
  it("returns the parsed Draft Scope Document, always producing output despite gaps", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: draftScope });

    const result = await generateDraftScopeDocument(positionDocument);

    expect(result).toEqual(draftScope);
    expect(result.flaggedGaps).toContain("Success metrics");
    expect(result.flaggedGaps).toContain("Creative direction");
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(generateDraftScopeDocument(positionDocument)).rejects.toThrow(
      TriageAgentError
    );
  });

  it("wraps unexpected errors in a friendly TriageAgentError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(generateDraftScopeDocument(positionDocument)).rejects.toThrow(
      TriageAgentError
    );
  });
});
