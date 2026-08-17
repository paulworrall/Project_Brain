import type { DocumentType } from "@/generated/prisma/enums";
import {
  ClarificationEmailSchema,
  PositionDocumentFieldsSchema,
  SetupChecklistSchema,
} from "@/types/intake";
import { DraftScopeDocumentSchema } from "@/types/triage";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";
import { ClarificationEmailView } from "./ClarificationEmailView";
import { PositionDocumentView } from "./PositionDocumentView";
import { ChecklistView } from "./ChecklistView";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";
import { DeliverablesServicesDocumentView } from "./DeliverablesServicesDocumentView";

/** Renders a single DocumentVersion's content read-only, for the Outputs Library / Version History views. */
export function DocumentVersionContent({
  projectId,
  type,
  content,
}: {
  projectId: string;
  type: DocumentType;
  content: unknown;
}) {
  switch (type) {
    case "CLARIFICATION_EMAIL": {
      const parsed = ClarificationEmailSchema.safeParse(content);
      return parsed.success ? (
        <ClarificationEmailView email={parsed.data} />
      ) : (
        <UnreadableContent />
      );
    }
    case "POSITION_DOCUMENT": {
      const parsed = PositionDocumentFieldsSchema.safeParse(content);
      return parsed.success ? <PositionDocumentView fields={parsed.data} /> : <UnreadableContent />;
    }
    case "CHECKLIST": {
      const parsed = SetupChecklistSchema.safeParse(content);
      return parsed.success ? (
        <ChecklistView
          items={parsed.data.items.map((label, i) => ({
            id: String(i),
            label,
            isComplete: false,
            detailText: null,
          }))}
        />
      ) : (
        <UnreadableContent />
      );
    }
    case "DRAFT_SCOPE_DOCUMENT": {
      const parsed = DraftScopeDocumentSchema.safeParse(content);
      return parsed.success ? <DraftScopeDocumentView scope={parsed.data} /> : <UnreadableContent />;
    }
    case "DELIVERABLES_SERVICES_DOCUMENT": {
      const parsed = DeliverablesServicesDocumentSchema.safeParse(content);
      return parsed.success ? (
        <DeliverablesServicesDocumentView projectId={projectId} document={parsed.data} readOnly />
      ) : (
        <UnreadableContent />
      );
    }
  }
}

function UnreadableContent() {
  return <p className="text-sm text-muted-foreground">This version&apos;s content couldn&apos;t be read.</p>;
}
