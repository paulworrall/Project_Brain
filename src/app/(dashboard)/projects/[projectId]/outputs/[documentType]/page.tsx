import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { DocumentType } from "@/generated/prisma/enums";
import { DOCUMENT_TYPE_LABELS } from "@/types/documents";
import { DocumentVersionContent } from "@/components/features/DocumentVersionContent";

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isDocumentType(value: string): value is DocumentType {
  return (Object.values(DocumentType) as string[]).includes(value);
}

export default async function DocumentVersionHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string; documentType: string }>;
}) {
  const { projectId, documentType } = await params;

  if (!isDocumentType(documentType)) {
    notFound();
  }

  const document = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: documentType } },
    include: {
      project: {
        include: { workstream: { include: { client: { include: { hub: true } } } } },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { createdBy: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  const { project, versions } = document;
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
          <Link href={`/projects/${project.id}/outputs`} className="hover:underline">
            Outputs Library
          </Link>
          {" / "}
          <span>{DOCUMENT_TYPE_LABELS[documentType]}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {DOCUMENT_TYPE_LABELS[documentType]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {versions.length} version{versions.length === 1 ? "" : "s"}, most recent first.
        </p>
      </div>

      <div className="space-y-4">
        {versions.map((version, index) => (
          <Card key={version.id} className="p-5">
            <details open={index === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Version {version.versionNumber} — Stage {version.stageNumber} ·{" "}
                {formatDateTime(version.createdAt)}
                {version.createdBy ? ` · ${version.createdBy.name}` : ""}
              </summary>
              <div className="mt-4">
                <DocumentVersionContent
                  projectId={project.id}
                  type={documentType}
                  content={version.content}
                />
              </div>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
