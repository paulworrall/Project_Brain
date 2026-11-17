import { describe, expect, it } from "vitest";
import { buildSpecialistRows, specialistHeader } from "@/lib/project/readiness";

describe("specialist rows", () => {
  it("follow the confirmed capabilities: one row each, defaulting to Not requested", () => {
    const rows = buildSpecialistRows(["EXPERIENCE_DESIGN", "TECH_AND_DATA"], []);
    expect(rows.map((r) => [r.capability, r.status, r.note])).toEqual([
      ["EXPERIENCE_DESIGN", "not_requested", null],
      ["TECH_AND_DATA", "not_requested", null],
    ]);
    expect(rows[0].label).toBeTruthy();
  });

  it("use stored rows, and hide (not lose) rows for capabilities no longer confirmed", () => {
    const stored = [
      { capability: "EXPERIENCE_DESIGN" as const, status: "received" as const, note: "From Sam" },
      { capability: "BUSINESS_ARCHITECTURE" as const, status: "requested" as const, note: null },
    ];
    const rows = buildSpecialistRows(["EXPERIENCE_DESIGN", "TECH_AND_DATA"], stored);
    expect(rows.map((r) => r.capability)).toEqual(["EXPERIENCE_DESIGN", "TECH_AND_DATA"]);
    expect(rows[0]).toMatchObject({ status: "received", note: "From Sam" });
    // Re-confirming the removed capability brings its stored row back.
    const again = buildSpecialistRows(["BUSINESS_ARCHITECTURE"], stored);
    expect(again[0]).toMatchObject({ capability: "BUSINESS_ARCHITECTURE", status: "requested" });
  });

  it("count received inputs in the header", () => {
    const rows = buildSpecialistRows(
      ["EXPERIENCE_DESIGN", "TECH_AND_DATA", "BUSINESS_ARCHITECTURE"],
      [
        { capability: "EXPERIENCE_DESIGN", status: "received", note: null },
        { capability: "TECH_AND_DATA", status: "received", note: null },
        { capability: "BUSINESS_ARCHITECTURE", status: "requested", note: null },
      ]
    );
    expect(specialistHeader(rows)).toBe("2 of 3 specialist inputs received");
    expect(specialistHeader(rows.slice(0, 1))).toBe("1 of 1 specialist input received");
  });
});
