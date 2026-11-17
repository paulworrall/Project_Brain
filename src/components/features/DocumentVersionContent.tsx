import type { DocumentType } from "@/generated/prisma/enums";
import { PositionDocumentFieldsSchema } from "@/types/intake";
import { DraftScopeDocumentSchema } from "@/types/triage";
import { DeliverablesServicesDocumentSchema } from "@/types/deliverables-services";
import { PositionDocumentView } from "./PositionDocumentView";
import { DraftScopeDocumentView } from "./DraftScopeDocumentView";
import { DeliverablesServicesDocumentView } from "./DeliverablesServicesDocumentView";
import { ScopeSummaryContentSchema } from "@/types/scope";
import { buildScopeView } from "@/lib/scopeSummaryView";
import { ScopeSummarySections } from "./ScopeSummarySections";

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
    // FB-011: retired documents (kept as data, never shown).
    case "CLARIFICATION_EMAIL":
    case "CHECKLIST":
      return null;
    case "POSITION_DOCUMENT": {
      const parsed = PositionDocumentFieldsSchema.safeParse(content);
      return parsed.success ? (
        <PositionDocumentView fields={parsed.data} showLegacyQuestions />
      ) : (
        <UnreadableContent />
      );
    }
    case "DRAFT_SCOPE_DOCUMENT": {
      const parsed = DraftScopeDocumentSchema.safeParse(content);
      return parsed.success ? <DraftScopeDocumentView scope={parsed.data} /> : <UnreadableContent />;
    }
    case "SCOPE_SUMMARY": {
      // History shows what this version stored; key details are shown live on the project.
      const parsed = ScopeSummaryContentSchema.safeParse(content);
      return parsed.success ? (
        <ScopeSummarySections
          sections={buildScopeView(parsed.data, { attributes: [], requiredOutstanding: [] }).filter(
            (section) => section.editable
          )}
        />
      ) : (
        <UnreadableContent />
      );
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
