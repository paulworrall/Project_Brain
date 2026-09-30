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

const reviewInput = {
  estimateBrief: {
    projectOverview: {
      context: "ESTIMATE_BRIEF_MARKER: a campaign refresh.",
      whatIsKnown: ["Budget confirmed at £250k"],
      constraints: ["UK market only"],
    },
    capabilitySections: [
      { capability: "EXPERIENCE_DESIGN" as const, whatIsExpected: ["Estimate the concept work"] },
    ],
  },
  outstandingGaps: ["Client Contact: not captured yet", "No production lead named"],
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

    const result = await extractDeliverablesAndServices(reviewInput, "Feedback here");

    expect(result).toEqual(deliverablesAndServices);
    expect(result.services.architecture.involvement).toBe("Not required.");
    expect(result.services.other.label).toBe("Legal & Compliance");
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-5");
    expect(callArgs.output_config.format.type).toBe("json_schema");
  });

  it("reviews the Estimate Brief and carries the outstanding gaps into the prompt — no Draft Scope Document", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: deliverablesAndServices });

    await extractDeliverablesAndServices(reviewInput, "Feedback here");

    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("<estimate_brief>");
    expect(prompt).toContain("ESTIMATE_BRIEF_MARKER");
    expect(prompt).toContain("- Client Contact: not captured yet");
    expect(prompt).toContain("- No production lead named");
    expect(prompt).not.toMatch(/draft scope/i);
  });

  it("throws a friendly error when Claude returns no parsed output", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    await expect(
      extractDeliverablesAndServices(reviewInput, "Feedback here")
    ).rejects.toThrow(SpecialistReviewExtractionError);
  });

  it("wraps unexpected errors in a friendly SpecialistReviewExtractionError", async () => {
    mockParse.mockRejectedValueOnce(new Error("network exploded"));

    await expect(
      extractDeliverablesAndServices(reviewInput, "Feedback here")
    ).rejects.toThrow(SpecialistReviewExtractionError);
  });
});
