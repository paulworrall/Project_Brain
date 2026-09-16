import { describe, expect, it } from "vitest";
import { renderEstimateBriefDocx } from "@/services/documents/estimate-brief-docx";

const content = {
  projectOverview: {
    context: "A campaign refresh for a coffee client.",
    whatIsKnown: ["Objective: refresh the campaign"],
    timeline: "Q4 2026",
    constraints: ["UK market only"],
  },
  capabilitySections: [
    { capability: "TECH_AND_DATA" as const, whatIsExpected: ["Confirm CRM integration effort"] },
    { capability: "EXPERIENCE_DESIGN" as const, whatIsExpected: ["Estimate the design system refresh"] },
  ],
};

describe("renderEstimateBriefDocx", () => {
  it("renders a real .docx (OOXML zip) buffer, not markdown or a PDF relabelled", async () => {
    const buffer = await renderEstimateBriefDocx(content);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // The OOXML/zip file signature ("PK") — proves this is a real .docx
    // container, not plain text dressed up with a .docx extension.
    expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a larger document for more capability sections", async () => {
    const oneSection = await renderEstimateBriefDocx({
      ...content,
      capabilitySections: [content.capabilitySections[0]],
    });
    const twoSections = await renderEstimateBriefDocx(content);

    expect(twoSections.length).toBeGreaterThan(oneSection.length);
  });
});
