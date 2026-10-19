import { notFound, redirect } from "next/navigation";
import { loadProjectPageData } from "@/lib/projectPageData";
import { getCurrentPhaseId } from "@/lib/projectPhases";

/** /projects/[id] lands on the project's current phase — the first one that isn't Complete. */
export default async function ProjectIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await loadProjectPageData(projectId);
  if (!data) {
    notFound();
  }
  redirect(`/projects/${projectId}/${getCurrentPhaseId(data.phaseStatuses)}`);
}
