import { describe, expect, it } from "vitest";
import {
  evaluateSowSync,
  formatMoney,
  sowSyncBannerText,
  sowVersionSourceLabel,
  type EstimateVersionRef,
} from "@/lib/sowSyncView";

const v1: EstimateVersionRef = {
  estimateVersionId: "ev_1",
  estimateId: "est_1",
  estimateLabel: "Main",
  versionNumber: 1,
  total: 50400,
  currency: "USD",
  capabilities: ["TECH_AND_DATA"],
};
const v3: EstimateVersionRef = {
  ...v1,
  estimateVersionId: "ev_3",
  versionNumber: 3,
  total: 93000,
  capabilities: ["TECH_AND_DATA", "EXPERIENCE_DESIGN", "MARKETING_OPERATIONS"],
};

describe("evaluateSowSync", () => {
  it("is in sync when the SOW's source is the estimate's current version", () => {
    expect(evaluateSowSync({ sowVersionId: "s2", sowVersionNumber: 2, source: v1, current: v1 })).toMatchObject({
      status: "in_sync",
      diff: null,
    });
  });

  it("is stale when the estimate has a newer version, with the total delta and capability changes", () => {
    const result = evaluateSowSync({
      sowVersionId: "s2",
      sowVersionNumber: 2,
      source: { ...v1, capabilities: ["TECH_AND_DATA", "BUSINESS_ARCHITECTURE"] },
      current: v3,
    });
    expect(result.status).toBe("stale");
    expect(result.diff).toEqual({
      totalDelta: 42600,
      currencyChange: null,
      capabilitiesAdded: ["EXPERIENCE_DESIGN", "MARKETING_OPERATIONS"],
      capabilitiesRemoved: ["BUSINESS_ARCHITECTURE"],
    });
  });

  it("doesn't subtract across currencies — it reports the currency change instead", () => {
    const result = evaluateSowSync({
      sowVersionId: "s2",
      sowVersionNumber: 2,
      source: v1,
      current: { ...v3, currency: "GBP" },
    });
    expect(result.diff).toMatchObject({ totalDelta: null, currencyChange: { from: "USD", to: "GBP" } });
  });

  it("is unlinked when the SOW has no recorded source", () => {
    expect(evaluateSowSync({ sowVersionId: "s1", sowVersionNumber: 1, source: null, current: null })).toMatchObject({
      status: "unlinked",
      diff: null,
    });
  });
});

describe("wording", () => {
  it("formats money as the estimate does, e.g. 50,400 USD", () => {
    expect(formatMoney(50400, "USD")).toBe("50,400 USD");
    expect(formatMoney(1234.5, "GBP")).toBe("1,234.50 GBP");
  });

  it("spells out the drift in one banner line", () => {
    const status = evaluateSowSync({ sowVersionId: "s2", sowVersionNumber: 2, source: v1, current: v3 });
    expect(sowSyncBannerText(status)).toBe(
      "SOW v2 is based on Estimate v1 — 50,400 USD. Latest estimate is v3 — 93,000 USD (+42,600 USD). Capabilities added: ED, MO."
    );
  });

  it("labels each SOW version with its source, or 'source unknown'", () => {
    expect(sowVersionSourceLabel({ sowVersionNumber: 2, source: v1 })).toBe("SOW v2 — from Estimate v1 — 50,400 USD");
    expect(sowVersionSourceLabel({ sowVersionNumber: 1, source: null })).toBe("SOW v1 — source unknown");
  });
});
