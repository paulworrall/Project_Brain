import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PIPELINE_STEPS, loadPipeline } from "@/lib/pipeline";
import {
  WorkstreamProjectsTable,
  type WorkstreamProjectRow,
} from "@/components/features/WorkstreamProjectsTable";

export default async function WorkstreamDetailPage({
  params,
}: {
  params: Promise<{ workstreamId: string }>;
}) {
  const { workstreamId } = await params;

  const workstream = await prisma.workstream.findUnique({
    where: { id: workstreamId },
    include: {
      client: { include: { hub: true } },
      projects: {
        orderBy: { updatedAt: "desc" },
        include: { projectManager: true },
      },
    },
  });

  if (!workstream) {
    notFound();
  }

  const { client, projects } = workstream;
  const { hub } = client;

  // FB-009 F: each project's current step (Brief / Estimate / SOW / Complete),
  // from the same derivation as the pipeline home page.
  const pipeline = await loadPipeline({ projectManagerId: null, clientId: null, workstreamId });
  const stepOf = new Map<string, number>();
  PIPELINE_STEPS.forEach((step, index) => {
    for (const card of pipeline.columns[step.id]) stepOf.set(card.id, index + 1);
  });

  const rows: WorkstreamProjectRow[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    currentStageNumber: stepOf.get(project.id) ?? 1,
    stageName: PIPELINE_STEPS[(stepOf.get(project.id) ?? 1) - 1].label,
    jobCode: project.jobCode,
    targetCompletionDate: project.targetCompletionDate,
    projectManagerName: project.projectManager?.name ?? null,
    updatedAt: project.updatedAt,
  }));

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/browse" className="hover:underline">
            {hub.name}
          </Link>
          {" / "}
          <Link href={`/clients/${client.id}`} className="hover:underline">
            {client.name}
          </Link>
          {" / "}
          <span>{workstream.name}</span>
        </nav>
        <h1 className="mt-1 text-3xl leading-tight font-light text-foreground sm:text-4xl">
          {workstream.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
      </div>

      <WorkstreamProjectsTable
        projects={rows}
        stageOptions={PIPELINE_STEPS.map((step, index) => ({
          number: index + 1,
          name: step.label,
        }))}
      />
    </div>
  );
}
