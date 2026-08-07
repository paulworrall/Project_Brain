import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectWorkflow } from "@/components/features/ProjectWorkflow";
import { ProjectSummaryBar } from "@/components/features/ProjectSummaryBar";
import {
  ClarificationEmailSchema,
  PositionDocumentFieldsSchema,
} from "@/types/intake";
import { DraftScopeDocumentSchema } from "@/types/triage";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";

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
      touchpointNotes: {
        orderBy: { createdAt: "desc" },
      },
      projectManager: true,
    },
  });

  if (!project) {
    notFound();
  }

  const [stages, projectManagerOptions] = await Promise.all([
    prisma.stage.findMany({
      orderBy: { number: "asc" },
      include: {
        stageStatuses: {
          where: { projectId },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "DELIVERY" },
      orderBy: { name: "asc" },
    }),
  ]);

  const { workstream, documents, checklistItems, touchpointNotes } = project;
  const { client } = workstream;
  const { hub } = client;

  const clarificationEmailContent = documents.find(
    (d) => d.type === "CLARIFICATION_EMAIL"
  )?.versions[0]?.content;
  const positionDocumentContent = documents.find(
    (d) => d.type === "POSITION_DOCUMENT"
  )?.versions[0]?.content;
  const draftScopeDocumentContent = documents.find(
    (d) => d.type === "DRAFT_SCOPE_DOCUMENT"
  )?.versions[0]?.content;
  const deliverablesServicesDocumentContent = documents.find(
    (d) => d.type === "DELIVERABLES_SERVICES_DOCUMENT"
  )?.versions[0]?.content;

  const clarificationEmail = ClarificationEmailSchema.safeParse(clarificationEmailContent);
  const positionDocument = PositionDocumentFieldsSchema.safeParse(positionDocumentContent);
  const draftScopeDocument = DraftScopeDocumentSchema.safeParse(draftScopeDocumentContent);
  const deliverablesServicesDocument = DeliverablesServicesDocumentSchema.safeParse(
    deliverablesServicesDocumentContent
  );

  const clarificationNotes =
    touchpointNotes.find((n) => n.type === "CLARIFICATION_REPLY")?.content ?? null;
  const specialistFeedback =
    touchpointNotes.find((n) => n.type === "SPECIALIST_REVIEW")?.content ?? null;

  const projectStatus = stages.every((stage) => stage.stageStatuses[0]?.status === "COMPLETE")
    ? "COMPLETE"
    : "ACTIVE";

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

      <ProjectSummaryBar
        projectId={project.id}
        status={projectStatus}
        jobCode={project.jobCode}
        kickOffDate={project.kickOffDate}
        targetCompletionDate={project.targetCompletionDate}
        projectManager={project.projectManager}
        projectManagerOptions={projectManagerOptions}
      />

      <ProjectWorkflow
        projectId={project.id}
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
        clarificationNotes={clarificationNotes}
        draftScopeDocument={draftScopeDocument.success ? draftScopeDocument.data : null}
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={
          deliverablesServicesDocument.success ? deliverablesServicesDocument.data : null
        }
      />
    </div>
  );
}
