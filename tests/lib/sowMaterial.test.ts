import { describe, expect, it } from "vitest";
import {
  SOW_MATERIAL_FIELDS,
  buildKeyDetailsSnapshot,
  changedSubFieldIds,
  diffCapabilities,
  isSowMaterialAttribute,
  parseKeyDetailsSnapshot,
} from "@/lib/sowMaterial";
import { BRIEF_ATTRIBUTES } from "@/lib/briefAttributes";

describe("SOW_MATERIAL_FIELDS", () => {
  it("only names real key-detail attributes", () => {
    const known = new Set(BRIEF_ATTRIBUTES.map((a) => a.id));
    for (const id of SOW_MATERIAL_FIELDS.attributeIds) expect(known.has(id)).toBe(true);
  });

  it("covers budget, timeline, scope/objective and the delivery dimensions — never the client contact", () => {
    for (const id of ["budget", "timeline", "scope", "objective", "markets", "languages", "channels"]) {
      expect(isSowMaterialAttribute(id)).toBe(true);
    }
    expect(isSowMaterialAttribute("clientContact")).toBe(false);
    expect(SOW_MATERIAL_FIELDS.capabilities).toBe(true);
    expect(SOW_MATERIAL_FIELDS.pinnedEstimateVersion).toBe(true);
  });
});

describe("snapshots", () => {
  it("keeps only material attributes, normalised, with capabilities sorted", () => {
    const snapshot = buildKeyDetailsSnapshot(
      {
        budget: { amount: "  €110k  " },
        clientContact: { name: "Jamie", email: "j@example.com" },
        markets: null,
      },
      ["TECH_AND_DATA", "EXPERIENCE_DESIGN"],
      new Date("2026-10-13T10:00:00Z")
    );

    expect(Object.keys(snapshot.attributes)).toEqual(["budget"]);
    expect(snapshot.attributes.budget).toEqual({ amount: "€110k" });
    expect(snapshot.capabilities).toEqual(["EXPERIENCE_DESIGN", "TECH_AND_DATA"]);
    expect(snapshot.takenAt).toBe("2026-10-13T10:00:00.000Z");
  });

  it("round-trips through JSON and rejects anything that isn't a snapshot", () => {
    const snapshot = buildKeyDetailsSnapshot({ budget: { amount: "€110k" } }, []);
    expect(parseKeyDetailsSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(parseKeyDetailsSnapshot(null)).toBeNull();
    expect(parseKeyDetailsSnapshot({})).toBeNull();
    expect(parseKeyDetailsSnapshot("nope")).toBeNull();
  });
});

describe("changedSubFieldIds", () => {
  it("names only the sub-fields that differ", () => {
    expect(
      changedSubFieldIds("timeline", { startDate: "2026-11-01", endDate: null, milestones: [] }, { startDate: "2026-11-01", endDate: "2027-01-15", milestones: [] })
    ).toEqual(["endDate"]);
  });

  it("compares milestones by content, ignoring whitespace, and treats missing as empty", () => {
    expect(
      changedSubFieldIds(
        "timeline",
        { milestones: [{ name: "Launch", date: "2027-01-10" }] },
        { milestones: [{ name: " Launch ", date: "2027-01-10" }] }
      )
    ).toEqual([]);
    expect(changedSubFieldIds("budget", undefined, { amount: "€1" })).toEqual(["amount"]);
    expect(changedSubFieldIds("budget", { amount: null }, undefined)).toEqual([]);
  });
});

describe("diffCapabilities", () => {
  it("reports added and removed capabilities", () => {
    expect(diffCapabilities(["TECH_AND_DATA"], ["TECH_AND_DATA", "EXPERIENCE_DESIGN"])).toEqual({
      added: ["EXPERIENCE_DESIGN"],
      removed: [],
    });
    expect(diffCapabilities(["TECH_AND_DATA"], [])).toEqual({ added: [], removed: ["TECH_AND_DATA"] });
  });
});
