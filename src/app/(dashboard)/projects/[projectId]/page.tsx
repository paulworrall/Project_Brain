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
            include: {
              hub: true,
              rateCards: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } },
            },
          },
        },
      },
      rateCard: true,
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
        include: { createdBy: true },
      },
      knowledgeItems: {
        orderBy: { uploadedAt: "desc" },
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

  const { workstream, documents, checklistItems, touchpointNotes, knowledgeItems } = project;
  const { client } = workstream;
  const { hub } = client;

  const clarificationEmailContent = documents.find(
    (d) => d.type === "CLARIFICATION_EMAIL"
  )?.versions[0]?.content;
  const positionDocumentContent = documents.find(
    (d) => d.type === "POSITION_DOCUMENT"
  )?.versions[0]?.content;
  const draftScopeDocumentVersion = documents.find(
    (d) => d.type === "DRAFT_SCOPE_DOCUMENT"
  )?.versions[0];
  const deliverablesServicesDocumentContent = documents.find(
    (d) => d.type === "DELIVERABLES_SERVICES_DOCUMENT"
  )?.versions[0]?.content;

  const clarificationEmail = ClarificationEmailSchema.safeParse(clarificationEmailContent);
  const positionDocument = PositionDocumentFieldsSchema.safeParse(positionDocumentContent);
  const draftScopeDocument = DraftScopeDocumentSchema.safeParse(draftScopeDocumentVersion?.content);
  const deliverablesServicesDocument = DeliverablesServicesDocumentSchema.safeParse(
    deliverablesServicesDocumentContent
  );

  // Every past client update, newest first — Phase 1's fluid workspace shows
  // the full timestamped log, not just the most recent one.
  const clientUpdates = touchpointNotes
    .filter((n) => n.type === "CLARIFICATION_REPLY")
    .map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      createdByName: n.createdBy?.name ?? null,
    }));
  const specialistFeedback =
    touchpointNotes.find((n) => n.type === "SPECIALIST_REVIEW")?.content ?? null;

  const projectStatus = stages.every((stage) => stage.stageStatuses[0]?.status === "COMPLETE")
    ? "COMPLETE"
    : "ACTIVE";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:underline">
              {hub.name}
            </Link>
            {" / "}
            <Link href={`/clients/${client.id}`} className="hover:underline">
              {client.name}
            </Link>
            {" / "}
            <Link href={`/workstreams/${workstream.id}`} className="hover:underline">
              {workstream.name}
            </Link>
          </nav>
          <h1 className="mt-1 text-xl font-semibold text-foreground">{project.name}</h1>
        </div>
        <Link
          href={`/projects/${project.id}/outputs`}
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Outputs Library →
        </Link>
      </div>

      <ProjectSummaryBar
        projectId={project.id}
        status={projectStatus}
        jobCode={project.jobCode}
        kickOffDate={project.kickOffDate}
        targetCompletionDate={project.targetCompletionDate}
        projectManager={project.projectManager}
        projectManagerOptions={projectManagerOptions}
        rateCard={
          project.rateCard
            ? { id: project.rateCard.id, name: project.rateCard.name, currency: project.rateCard.currency }
            : null
        }
        rateCardOptions={client.rateCards.map((rc) => ({
          id: rc.id,
          name: rc.name,
          currency: rc.currency,
        }))}
      />

      <ProjectWorkflow
        projectId={project.id}
        projectName={project.name}
        stages={stages.map((stage) => ({
          stageNumber: stage.number,
          name: stage.name,
          status: stage.stageStatuses[0]?.status ?? "NOT_STARTED",
        }))}
        clarificationEmail={clarificationEmail.success ? clarificationEmail.data : null}
        positionDocument={positionDocument.success ? positionDocument.data : null}
        clientUpdates={clientUpdates}
        checklistItems={checklistItems.map((item) => ({
          id: item.id,
          label: item.label,
          isComplete: item.isComplete,
          detailText: item.detailText,
        }))}
        draftScopeDocument={draftScopeDocument.success ? draftScopeDocument.data : null}
        draftScopeDocumentMeta={
          draftScopeDocument.success && draftScopeDocumentVersion
            ? {
                versionNumber: draftScopeDocumentVersion.versionNumber,
                createdAt: draftScopeDocumentVersion.createdAt,
              }
            : null
        }
        specialistFeedback={specialistFeedback}
        deliverablesServicesDocument={
          deliverablesServicesDocument.success ? deliverablesServicesDocument.data : null
        }
        knowledgeItems={knowledgeItems.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          originalFileName: item.originalFileName,
        }))}
      />
    </div>
  );
}
