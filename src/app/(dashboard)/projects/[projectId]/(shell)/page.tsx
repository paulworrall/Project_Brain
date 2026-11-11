import { notFound, redirect } from "next/navigation";
import { loadProjectPageData } from "@/lib/projectPageData";

/** /projects/[id] lands on the project's current step — the first not Done (`sow` once complete). */
export default async function ProjectIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await loadProjectPageData(projectId);
  if (!data) {
    notFound();
  }
  redirect(`/projects/${projectId}/${data.currentStepId}`);
}
