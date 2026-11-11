import { notFound, redirect } from "next/navigation";
import { loadProjectPageData } from "@/lib/projectPageData";
import { RETIRED_PHASE_SLUGS, isStepId } from "@/lib/projectSteps";

/**
 * One step's route (/brief, /estimate, /sow). The project layout renders every
 * step's content (kept mounted so unsaved work survives a switch) and shows
 * the one named by this segment, so the page itself renders nothing. FB-007's
 * phase slugs redirect to the current step; anything else is a 404. The
 * folder keeps FB-007's `[phase]` name — renaming "phase" files is out of scope.
 */
export default async function ProjectStepPage({
  params,
}: {
  params: Promise<{ projectId: string; phase: string }>;
}) {
  const { projectId, phase } = await params;
  if (isStepId(phase)) {
    return null;
  }
  if (RETIRED_PHASE_SLUGS.includes(phase)) {
    const data = await loadProjectPageData(projectId);
    if (!data) notFound();
    redirect(`/projects/${projectId}/${data.currentStepId}`);
  }
  notFound();
}
