import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectWorkflow } from "@/components/features/ProjectWorkflow";
import {
  ClarificationEmailSchema,
  PositionDocumentFieldsSchema,
} from "@/types/intake";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workstream: {
        include: {
          client: {
            include: { hub: true },
          },
        },
      },
      documents: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      checklistItems: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const stages = await prisma.stage.findMany({
    orderBy: { number: "asc" },
    include: {
      stageStatuses: {
        where: { projectId },
      },
    },
  });

  const { workstream, documents, checklistItems } = project;
  const { client } = workstream;
  const { hub } = client;

  const clarificationEmailContent = documents.find(
    (d) => d.type === "CLARIFICATION_EMAIL"
  )?.versions[0]?.content;
  const positionDocumentContent = documents.find(
    (d) => d.type === "POSITION_DOCUMENT"
  )?.versions[0]?.content;

  const clarificationEmail = ClarificationEmailSchema.safeParse(clarificationEmailContent);
  const positionDocument = PositionDocumentFieldsSchema.safeParse(positionDocumentContent);

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            {hub.name}
          </Link>
          {" / "}
          <span>{client.name}</span>
          {" / "}
          <span>{workstream.name}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{project.name}</h1>
      </div>

      <ProjectWorkflow
        projectName={project.name}
        briefFileName={project.briefFileName}
        stages={stages.map((stage) => ({
          stageNumber: stage.number,
          name: stage.name,
          status: stage.stageStatuses[0]?.status ?? "NOT_STARTED",
        }))}
        clarificationEmail={clarificationEmail.success ? clarificationEmail.data : null}
        positionDocument={positionDocument.success ? positionDocument.data : null}
        checklistItems={checklistItems.map((item) => ({
          id: item.id,
          label: item.label,
          isComplete: item.isComplete,
        }))}
      />
    </div>
  );
}
