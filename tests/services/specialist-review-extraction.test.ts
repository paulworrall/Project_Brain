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
const { extractDeliverablesAndServices, SpecialistReviewExtractionError } = await import(
  "@/services/agents/specialist-review-extraction"
);

const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;

const draftScopeDocument = {
  objectives: ["Refresh the campaign"],
  deliverables: ["Creative assets"],
  milestones: [{ name: "Kick-off", dueDate: null }],
  rolesAndResponsibilities: {
    contacts: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" as const }],
    capabilities: ["Creative"],
  },
  budget: { summary: "Confirmed at £250k", isConfirmed: true },
  assumptionsAndConstraints: ["UK market only"],
  flaggedGaps: ["No production lead named"],
};

const deliverablesAndServices = {
  deliverables: ["Creative concept territories"],
  services: {
    experienceCreative: { involvement: "Lead concept and design." },
    business: { involvement: "Not required." },
    architecture: { involvement: "Not required." },
    techAndData: { involvement: "Not required." },
    orchestration: { involvement: "Coordinate the schedule." },
    other: { involvement: "Legal review of influencer usage.", label: "Legal & Compliance" },
  },
  openQuestionsRisks: ["POS print lead time risk"],
  outstandingGapsCarriedForward: ["No production lead named"],
};

beforeEach(() => {
  mockParse.mockReset();
});

describe("extractDeliverablesAndServices", () => {
  it("returns the parsed Deliverables + Services Document, with all six service rows present", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: deliverablesAndServices });

    const result = await extractDeliverablesAndServices(draftScopeDocument, "Feedback here");

    expect(result).toEqual(deliverablesAndServices);
    expect(result.services.architecture.involvement).toBe("Not required.");
    expect(result.services.other.label).toBe("Legal & Compliance");
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      extractDeliverablesAndServices(draftScopeDocument, "Feedback here")
    ).rejects.toThrow(SpecialistReviewExtractionError);
  });

  it("wraps unexpected errors in a friendly SpecialistReviewExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      extractDeliverablesAndServices(draftScopeDocument, "Feedback here")
    ).rejects.toThrow(SpecialistReviewExtractionError);
  });
});
