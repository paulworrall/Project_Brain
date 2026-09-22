import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { SERVICE_ROWS } from "@/types/deliverables-services";
import type { SOWContent } from "@/types/sow";

function bulletList(items: string[]): Paragraph[] {
  return items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }));
}

/**
 * Renders an SOWContent into a real .docx — cover details, then one section
 * per part of the drafted body. Pure rendering, no AI call, no DB access:
 * the content is already fully structured by the time it reaches here (see
 * sow-agent.ts for the narrative half, sow-context.ts for the deterministic
 * cover-details half).
 */
export async function renderSowDocx({ coverDetails, body }: SOWContent): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Statement of Work", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: coverDetails.projectName, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Client: ${coverDetails.clientName}` }),
    ...(coverDetails.jobCode ? [new Paragraph({ text: `Job code: ${coverDetails.jobCode}` })] : []),
    new Paragraph({ text: `Prepared: ${coverDetails.preparedDate}` }),
    ...(coverDetails.kickOffDate ? [new Paragraph({ text: `Kick-off: ${coverDetails.kickOffDate}` })] : []),
    ...(coverDetails.targetCompletionDate
      ? [new Paragraph({ text: `Target completion: ${coverDetails.targetCompletionDate}` })]
      : []),
    ...(coverDetails.primaryClientContactName
      ? [
          new Paragraph({
            text: `Client contact: ${coverDetails.primaryClientContactName}${
              coverDetails.primaryClientContactEmail ? ` (${coverDetails.primaryClientContactEmail})` : ""
            }`,
          }),
        ]
      : []),

    new Paragraph({ text: "Background & Objectives", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: body.scopeSummary.background }),
    ...bulletList(body.scopeSummary.objectives),

    new Paragraph({ text: "Deliverables", heading: HeadingLevel.HEADING_1 }),
    ...bulletList(body.deliverables),

    new Paragraph({ text: "Services", heading: HeadingLevel.HEADING_1 }),
    ...SERVICE_ROWS.flatMap(({ key, label }) => [
      new Paragraph({ text: label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: body.services[key].involvement }),
    ]),
    new Paragraph({ text: body.services.other.label, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: body.services.other.involvement }),

    new Paragraph({ text: "Milestones", heading: HeadingLevel.HEADING_1 }),
    ...body.milestones.map(
      (m) => new Paragraph({ text: `${m.name}${m.dueDate ? ` — ${m.dueDate}` : ""}`, bullet: { level: 0 } })
    ),

    new Paragraph({ text: "Roles & Responsibilities", heading: HeadingLevel.HEADING_1 }),
    ...body.rolesAndResponsibilities.map(
      (c) =>
        new Paragraph({
          text: `${c.name} — ${c.role} (${c.organization === "AGENCY" ? "Agency" : "Client"})`,
          bullet: { level: 0 },
        })
    ),

    new Paragraph({ text: "Assumptions", heading: HeadingLevel.HEADING_1 }),
    ...bulletList(body.assumptions),

    new Paragraph({ text: "Out of Scope", heading: HeadingLevel.HEADING_1 }),
    ...bulletList(body.outOfScope),

    new Paragraph({ text: "Risks & Open Questions", heading: HeadingLevel.HEADING_1 }),
    ...bulletList(body.risks),

    ...(coverDetails.commercials
      ? [
          new Paragraph({ text: "Commercials", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${coverDetails.commercials.totalValue.toFixed(2)} ${coverDetails.commercials.currency} — ${coverDetails.commercials.description}`,
              }),
            ],
          }),
        ]
      : []),
  ];

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
