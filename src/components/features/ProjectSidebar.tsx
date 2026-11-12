import { AddProjectInformationPanel } from "./AddProjectInformationPanel";
import { ProjectAssistant } from "./ProjectAssistant";
import type { VersionView } from "./VersionHistoryDrawer";

/**
 * The project sidebar: Add project information (FB-010 — meeting notes,
 * clarifications, presentations and documents, with the version history),
 * then the Project assistant (questions and short typed updates).
 * Step-independent: the project layout renders one instance and it stays
 * mounted across step switches (and inside the narrow-screen drawer), so
 * drafts survive.
 */
export function ProjectSidebar({
  projectId,
  projectName,
  versions,
  projectComplete = false,
}: {
  projectId: string;
  projectName: string;
  versions: VersionView[];
  projectComplete?: boolean;
}) {
  return (
    <div className="space-y-4">
      <AddProjectInformationPanel
        projectId={projectId}
        versions={versions}
        readOnly={projectComplete}
      />
      <ProjectAssistant projectId={projectId} projectName={projectName} />
    </div>
  );
}
