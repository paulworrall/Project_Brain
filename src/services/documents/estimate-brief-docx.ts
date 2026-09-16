import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { EstimateBriefContent } from "@/types/capabilities";
import { capabilityLabel } from "@/lib/mapCapabilities";

function bulletList(items: string[]): Paragraph[] {
  return items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }));
}

/**
 * Renders an EstimateBriefContent into a real .docx file — one shared
 * project-overview section followed by one section per confirmed
 * capability. Pure rendering, no AI call: the content is already
 * structured JSON from estimate-brief-agent.ts by the time it reaches here.
 */
export async function renderEstimateBriefDocx(content: EstimateBriefContent): Promise<Buffer> {
  const { projectOverview, capabilitySections } = content;

  const children: Paragraph[] = [
    new Paragraph({ text: "Estimate Brief", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "Project Overview", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: "Context", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: projectOverview.context }),
    new Paragraph({ text: "What's known so far", heading: HeadingLevel.HEADING_2 }),
    ...bulletList(projectOverview.whatIsKnown),
    new Paragraph({ text: "Timeline", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: projectOverview.timeline }),
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
