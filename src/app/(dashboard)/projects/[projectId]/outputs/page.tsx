import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_ORDER } from "@/types/documents";

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function OutputsLibraryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workstream: { include: { client: { include: { hub: true } } } },
      documents: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: { createdBy: true },
          },
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const { workstream, documents } = project;
  const { client } = workstream;
  const { hub } = client;

  const documentsByType = new Map(documents.map((d) => [d.type, d]));

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
          <Link href={`/workstreams/${workstream.id}`} className="hover:underline">
            {workstream.name}
          </Link>
          {" / "}
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
          {" / "}
          <span>Outputs Library</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Outputs Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every artifact this project has produced, versioned at each stage transition.
        </p>
      </div>

      <div className="space-y-3">
        {DOCUMENT_TYPE_ORDER.filter((type) => documentsByType.has(type)).map((type) => {
          const document = documentsByType.get(type)!;
          const latestVersion = document.versions[0];

          return (
            <Card key={type} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{DOCUMENT_TYPE_LABELS[type]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {latestVersion.versionNumber} · Stage {latestVersion.stageNumber} ·{" "}
                  {formatDateTime(latestVersion.createdAt)}
                  {latestVersion.createdBy ? ` · ${latestVersion.createdBy.name}` : ""}
                </p>
              </div>
              <Link
                href={`/projects/${project.id}/outputs/${type}`}
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                View version history →
              </Link>
            </Card>
          );
        })}

        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents generated yet.</p>
        )}
      </div>
    </div>
  );
}
