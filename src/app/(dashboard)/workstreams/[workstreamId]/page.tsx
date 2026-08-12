import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

  const stages = await prisma.stage.findMany({ orderBy: { number: "asc" } });
  const stageNameByNumber = new Map(stages.map((s) => [s.number, s.name]));

  const rows: WorkstreamProjectRow[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    currentStageNumber: project.currentStageNumber,
    stageName: stageNameByNumber.get(project.currentStageNumber) ?? "Unknown",
    jobCode: project.jobCode,
    targetCompletionDate: project.targetCompletionDate,
    projectManagerName: project.projectManager?.name ?? null,
    updatedAt: project.updatedAt,
  }));

  return (
    <div className="space-y-6">
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
          <span>{workstream.name}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{workstream.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
      </div>

      <WorkstreamProjectsTable
        projects={rows}
        stageOptions={stages.map((s) => ({ number: s.number, name: s.name }))}
      />
    </div>
  );
}
