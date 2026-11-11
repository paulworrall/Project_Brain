import { ProjectAssistant } from "./ProjectAssistant";
import type { VersionView } from "./VersionHistoryDrawer";

/**
 * The project sidebar. Since FB-008 its only panel is the Project assistant
 * (Ask me anything and Keep This Project Up to Date merged). Step-independent:
 * the project layout renders one instance and it stays mounted across step
 * switches (and inside the narrow-screen drawer), so a draft message survives.
 */
export function ProjectSidebar({
  projectId,
  projectName,
  versions,
}: {
  projectId: string;
  projectName: string;
  versions: VersionView[];
}) {
  return <ProjectAssistant projectId={projectId} projectName={projectName} versions={versions} />;
}
