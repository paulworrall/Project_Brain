import { describe, expect, it } from "vitest";
import {
  BRIEF_ATTRIBUTES,
  getBriefAttribute,
  isSubFieldFilled,
  REQUIRED_BRIEF_ATTRIBUTES,
} from "@/lib/briefAttributes";

function subFieldRequirements(attributeId: string): Record<string, boolean> {
  const attribute = getBriefAttribute(attributeId)!;
  return Object.fromEntries(attribute.subFields.map((f) => [f.id, f.required]));
}

describe("brief key attributes config", () => {
  it("defines exactly the 4 required attributes, in priority order, each with a question and sub-fields", () => {
    expect(REQUIRED_BRIEF_ATTRIBUTES.map((a) => a.id)).toEqual([
      "budget",
      "objective",
      "timeline",
      "clientContact",
    ]);
    for (const attribute of REQUIRED_BRIEF_ATTRIBUTES) {
      expect(attribute.label).toBeTruthy();
      expect(attribute.question).toMatch(/\?$/);
      expect(attribute.subFields.length).toBeGreaterThan(0);
    }
  });

  it("budget needs an amount or range and a currency", () => {
    expect(getBriefAttribute("budget")?.question).toBe("What is the budget for the project?");
    expect(subFieldRequirements("budget")).toEqual({ amount: true, currency: true });
  });

  it("objective needs the objective and its success measures (OKRs/KPIs)", () => {
    expect(getBriefAttribute("objective")?.question).toMatch(/OKRs\/KPIs/);
    expect(subFieldRequirements("objective")).toEqual({ objective: true, successMeasures: true });
  });

  it("timeline is labelled 'Timeline and Key Milestones' — start date required, end date and milestones optional", () => {
    const timeline = getBriefAttribute("timeline")!;
    expect(timeline.label).toBe("Timeline and Key Milestones");
    expect(timeline.question).toBe("What is the expected timeline? What are the key milestones?");
    expect(subFieldRequirements("timeline")).toEqual({
      startDate: true,
      endDate: false,
      milestones: false,
    });
    expect(timeline.subFields.find((f) => f.id === "milestones")?.type).toBe("milestones");
  });

  it("client contact needs a name and email — role optional", () => {
    expect(getBriefAttribute("clientContact")?.question).toBe(
      "Who is the client contact who will be running the project?"
    );
    expect(subFieldRequirements("clientContact")).toEqual({ name: true, role: false, email: true });
  });

  it("seeds optional attributes alongside the required ones", () => {
    const optionalIds = BRIEF_ATTRIBUTES.filter((a) => !a.required).map((a) => a.id);
    expect(optionalIds).toEqual(
      expect.arrayContaining(["scope", "markets", "languages", "channels"])
    );
  });

  it("has unique attribute ids and unique sub-field ids within each attribute", () => {
    const ids = BRIEF_ATTRIBUTES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const attribute of BRIEF_ATTRIBUTES) {
      const subIds = attribute.subFields.map((f) => f.id);
      expect(new Set(subIds).size).toBe(subIds.length);
    }
  });

  it("returns undefined for an attribute id that isn't in the config", () => {
    expect(getBriefAttribute("notAThing")).toBeUndefined();
  });
});

describe("isSubFieldFilled", () => {
  const timeline = getBriefAttribute("timeline")!;
  const startDate = timeline.subFields.find((f) => f.id === "startDate")!;
  const milestones = timeline.subFields.find((f) => f.id === "milestones")!;

  it("treats blank or whitespace text as not filled", () => {
    expect(isSubFieldFilled(startDate, null)).toBe(false);
    expect(isSubFieldFilled(startDate, "   ")).toBe(false);
    expect(isSubFieldFilled(startDate, "2026-10-01")).toBe(true);
  });

  it("treats a milestone list as filled only when it has at least one named milestone", () => {
    expect(isSubFieldFilled(milestones, [])).toBe(false);
    expect(isSubFieldFilled(milestones, [{ name: " ", date: null }])).toBe(false);
    expect(isSubFieldFilled(milestones, [{ name: "Launch", date: "2026-12-01" }])).toBe(true);
  });
});
