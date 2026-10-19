import type { ApprovedDocumentsSummary } from "@/types/approvals";
import { ChatPanel } from "./ChatPanel";
import { KnowledgeUpload, type VersionView } from "./KnowledgeUpload";
import type { ChecklistItemView } from "./ChecklistView";
import { EditableChecklist } from "./EditableChecklist";
import { ApprovedDocumentsPanel } from "./ApprovedDocumentsPanel";

/**
 * The project-wide tools — Ask me anything, Keep This Project Up to Date, the
 * Project Set-Up Checklist and the approved documents. Phase-independent: the
 * project layout renders one instance and it stays mounted across phase tabs
 * (and inside the narrow-screen drawer), so draft text and checklist state
 * survive a tab switch.
 */
export function ProjectSidebar({
  projectId,
  projectName,
  versions,
  checklistItems,
  approvedDocuments,
}: {
  projectId: string;
  projectName: string;
  versions: VersionView[];
  checklistItems: ChecklistItemView[];
  approvedDocuments: ApprovedDocumentsSummary;
}) {
  return (
    <div className="space-y-4">
      <ChatPanel projectId={projectId} projectName={projectName} />
      <KnowledgeUpload projectId={projectId} versions={versions} />
      <EditableChecklist projectId={projectId} items={checklistItems} />
      <ApprovedDocumentsPanel summary={approvedDocuments} />
    </div>
  );
}
