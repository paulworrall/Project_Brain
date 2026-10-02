import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EstimateBuildWorkspace } from "@/components/features/EstimateBuildWorkspace";
import { getEstimateBuildViewData } from "@/lib/estimateBuildViewData";
import { getSowSyncStatus } from "@/lib/sowSync";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; estimateId: string }>;
}) {
  const { projectId, estimateId } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, projectId },
    include: {
      project: {
        include: { workstream: { include: { client: { include: { hub: true } } } } },
      },
      rateCardVersion: { include: { rateCard: true } },
    },
  });

  if (!estimate) {
    notFound();
  }

  const { project, rateCardVersion } = estimate;
  const { workstream } = project;
  const { client } = workstream;
  const { hub } = client;

  const [view, sowSync] = await Promise.all([
    getEstimateBuildViewData(estimateId),
    getSowSyncStatus(projectId),
  ]);
  if (!view) {
    notFound();
  }
  // The project's SOW, if it's based on this estimate — saving a new version will put it out of date.
  const pinnedSow = sowSync.sow?.source?.estimateId === estimate.id ? sowSync.sow : null;

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
          <span>{estimate.label}</span>
        </nav>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{estimate.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Locked to {rateCardVersion.rateCard.name} (version {rateCardVersion.versionNumber})
            </p>
          </div>
          <Link
            href={`/projects/${project.id}`}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            ← Back to project
          </Link>
        </div>
      </div>

      <EstimateBuildWorkspace
        projectId={project.id}
        estimateId={estimate.id}
        sowNotice={
          pinnedSow?.source
            ? {
                sowVersionNumber: pinnedSow.sowVersionNumber,
                estimateVersionNumber: pinnedSow.source.versionNumber,
                total: pinnedSow.source.total,
                currency: pinnedSow.source.currency,
              }
            : null
        }
        pendingResolutions={view.pendingResolutions}
        rateCardLines={view.rateCardLines}
        reviewContent={view.reviewContent}
        latestVersion={view.latestVersion}
      />
    </div>
  );
}
