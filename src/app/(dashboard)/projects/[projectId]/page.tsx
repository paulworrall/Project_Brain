import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectDetailTabs } from "@/components/features/ProjectDetailTabs";

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
    },
  });

  if (!project) {
    notFound();
  }

  const { workstream } = project;
  const { client } = workstream;
  const { hub } = client;

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

      <ProjectDetailTabs />
    </div>
  );
}
