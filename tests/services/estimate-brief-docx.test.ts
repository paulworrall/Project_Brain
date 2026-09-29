import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { renderEstimateBriefDocx } from "@/services/documents/estimate-brief-docx";
import { timelineSection } from "@/lib/briefAttributeDisplay";
import { briefCompleteness, briefRecord } from "../fixtures/briefCompleteness";

const content = {
  projectOverview: {
    context: "A campaign refresh for a coffee client.",
    whatIsKnown: ["Objective: refresh the campaign"],
    constraints: ["UK market only"],
  },
  capabilitySections: [
    { capability: "TECH_AND_DATA" as const, whatIsExpected: ["Confirm CRM integration effort"] },
    { capability: "EXPERIENCE_DESIGN" as const, whatIsExpected: ["Estimate the design system refresh"] },
  ],
};

const noTimeline = timelineSection(briefCompleteness());

async function documentText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("renderEstimateBriefDocx", () => {
  it("renders a real .docx (OOXML zip) buffer, not markdown or a PDF relabelled", async () => {
    const buffer = await renderEstimateBriefDocx(content, noTimeline);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // The OOXML/zip file signature ("PK") — proves this is a real .docx
    // container, not plain text dressed up with a .docx extension.
    expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a larger document for more capability sections", async () => {
    const oneSection = await renderEstimateBriefDocx(
      { ...content, capabilitySections: [content.capabilitySections[0]] },
      noTimeline
    );
    const twoSections = await renderEstimateBriefDocx(content, noTimeline);

    expect(twoSections.length).toBeGreaterThan(oneSection.length);
  });

  it("titles the timeline from the config and shows the confirmed start, end and milestones", async () => {
    const timeline = timelineSection(
      briefCompleteness([
        briefRecord("timeline", {
          startDate: "2026-10-01",
          endDate: "2026-12-15",
          milestones: [
            { name: "Beta", date: "2026-11-01" },
            { name: "Launch", date: null },
          ],
        }),
      ])
    );

    const text = await documentText(await renderEstimateBriefDocx(content, timeline));

    expect(text).toContain("Timeline and Key Milestones");
    expect(text).toMatch(/Start date: 1 Oct 2026/);
    expect(text).toMatch(/End date: 15 Dec 2026/);
    expect(text).toContain("Beta — 1 Nov 2026");
    expect(text).toContain("Launch — Date not confirmed");
    expect(text).not.toContain("No milestones confirmed yet");
  });

  it("says plainly when nothing is confirmed, and marks a client suggestion as unconfirmed", async () => {
    const timeline = timelineSection(
      briefCompleteness([
        briefRecord(
          "timeline",
          { startDate: "2026-10-01" },
          { kind: "SUGGESTION", source: "BRIEF" }
        ),
      ])
    );

    const text = await documentText(await renderEstimateBriefDocx(content, timeline));

    expect(text).toMatch(/Start date: Not confirmed yet/);
    expect(text).toMatch(/End date: Not confirmed yet/);
    expect(text).toContain("No milestones confirmed yet");
    expect(text).toMatch(/Unconfirmed — .*Start date: 1 Oct 2026/);
  });
});
