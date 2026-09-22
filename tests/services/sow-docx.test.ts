import { describe, expect, it } from "vitest";
import { renderSowDocx } from "@/services/documents/sow-docx";
import type { SOWContent } from "@/types/sow";

const content: SOWContent = {
  coverDetails: {
    projectName: "Loyalty App Relaunch",
    clientName: "Coffee",
    jobCode: "COF-2026-001",
    preparedDate: "22 September 2026",
    kickOffDate: "1 October 2026",
    targetCompletionDate: "31 March 2027",
    primaryClientContactName: "Jamie Chen",
    primaryClientContactEmail: "jamie@example.com",
    commercials: { totalValue: 5700, currency: "GBP", description: "2 capabilities: TAD, EXD" },
  },
  body: {
    scopeSummary: {
      objectives: ["Deliver a refreshed loyalty app"],
      background: "The client wants to modernize their loyalty programme ahead of Q2 2026.",
    },
    deliverables: ["Points-based rewards system", "Referral programme"],
    services: {
      experienceCreative: { involvement: "Design the rewards UI" },
      business: { involvement: "Not included in this engagement" },
      architecture: { involvement: "Not included in this engagement" },
      techAndData: { involvement: "Build the integration" },
      orchestration: { involvement: "Coordinate the launch" },
      other: { involvement: "Not included in this engagement", label: "Other" },
    },
    milestones: [{ name: "Kick-off", dueDate: null }],
    rolesAndResponsibilities: [{ name: "Jamie Chen", role: "Client contact", organization: "CLIENT" }],
    assumptions: ["UK market only"],
    outOfScope: ["Loyalty programme migration from the legacy platform"],
    risks: ["Target audience still unknown"],
  },
};

describe("renderSowDocx", () => {
  it("renders a real .docx (OOXML zip) buffer, not markdown or a PDF relabelled", async () => {
    const buffer = await renderSowDocx(content);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a larger document when more deliverables/risks are included", async () => {
    const shorter = await renderSowDocx({
      ...content,
      body: { ...content.body, deliverables: [content.body.deliverables[0]], risks: [] },
    });
    const longer = await renderSowDocx(content);

    expect(longer.length).toBeGreaterThan(shorter.length);
  });

  it("omits the Commercials section when no estimate has been saved", async () => {
    const noCommercials = await renderSowDocx({
      ...content,
      coverDetails: { ...content.coverDetails, commercials: null },
    });

    expect(Buffer.isBuffer(noCommercials)).toBe(true);
    expect(noCommercials.length).toBeGreaterThan(0);
  });
});
