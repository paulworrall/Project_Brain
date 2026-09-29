import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { EstimateBriefContent } from "@/types/capabilities";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  formatBriefDate,
  formatMilestone,
  NO_MILESTONES_TEXT,
  NOT_CONFIRMED_TEXT,
  type TimelineSection,
} from "@/lib/briefAttributeDisplay";

function bulletList(items: string[]): Paragraph[] {
  return items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }));
}

function labelledLine(label: string, value: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] });
}

/**
 * The timeline comes from the key details, never from the AI — so missing
 * dates or milestones are said plainly instead of guessed.
 */
function timelineParagraphs(timeline: TimelineSection): Paragraph[] {
  const { labels } = timeline;
  return [
    new Paragraph({ text: timeline.heading, heading: HeadingLevel.HEADING_2 }),
    labelledLine(labels.startDate, timeline.startDate ? formatBriefDate(timeline.startDate) : NOT_CONFIRMED_TEXT),
    labelledLine(labels.endDate, timeline.endDate ? formatBriefDate(timeline.endDate) : NOT_CONFIRMED_TEXT),
    new Paragraph({ children: [new TextRun({ text: labels.milestones, bold: true })] }),
    ...(timeline.milestones.length > 0
      ? bulletList(timeline.milestones.map(formatMilestone))
      : [new Paragraph({ text: NO_MILESTONES_TEXT })]),
  ];
}

/**
 * Renders an EstimateBriefContent into a real .docx file — one shared
 * project-overview section followed by one section per confirmed
 * capability. Pure rendering, no AI call: the content is already
 * structured JSON from estimate-brief-agent.ts by the time it reaches here,
 * and the timeline comes straight from the key details.
 */
export async function renderEstimateBriefDocx(
  content: EstimateBriefContent,
  timeline: TimelineSection
): Promise<Buffer> {
  const { projectOverview, capabilitySections } = content;

  const children: Paragraph[] = [
    new Paragraph({ text: "Estimate Brief", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "Project Overview", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: "Context", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: projectOverview.context }),
    new Paragraph({ text: "What's known so far", heading: HeadingLevel.HEADING_2 }),
    ...bulletList(projectOverview.whatIsKnown),
    ...timelineParagraphs(timeline),
    new Paragraph({ text: "Constraints", heading: HeadingLevel.HEADING_2 }),
    ...bulletList(projectOverview.constraints),
  ];

  for (const section of capabilitySections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: capabilityLabel(section.capability) })],
      }),
      new Paragraph({ text: "What's expected of you to estimate against", heading: HeadingLevel.HEADING_2 }),
      ...bulletList(section.whatIsExpected)
    );
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
