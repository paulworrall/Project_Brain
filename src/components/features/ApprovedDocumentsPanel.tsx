import { SidebarPanel } from "./SidebarPanel";
import { DocumentStatusBadge } from "@/components/ui/DocumentStatusBadge";
import { formatApprovalDate } from "@/lib/commercial/approvalCopy";
import { formatMoney } from "@/lib/formatMoney";
import type { ApprovedDocSummary, ApprovedDocumentsSummary } from "@/types/approvals";

const LINK_CLASS =
  "font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Slot({ heading, doc }: { heading: string; doc: ApprovedDocSummary | null }) {
  return (
    <section aria-label={heading} className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h4>
      {doc ? (
        <div className="space-y-1 text-xs text-foreground">
          <p className="text-sm font-medium">
            {doc.name} · v{doc.versionNumber}
          </p>
          <DocumentStatusBadge state="approved" approvedOn={doc.approval.clientApprovedOn} />
          {doc.total !== null && doc.currency && <p>{formatMoney(doc.total, doc.currency)}</p>}
          <p>
            Approved {formatApprovalDate(doc.approval.clientApprovedOn)} by{" "}
            {doc.approval.clientApproverName}
          </p>
          {doc.approval.reference && <p>Reference: {doc.approval.reference}</p>}
          <p className="text-muted-foreground">
            Recorded by {doc.approval.recordedBy.name} on{" "}
            {formatApprovalDate(doc.approval.recordedAt.slice(0, 10))}
          </p>
          <p className="flex flex-wrap gap-x-3">
            <a href={doc.downloadHref} className={LINK_CLASS}>
              Download .docx
            </a>
            <a href={`#${doc.sectionId}`} className={LINK_CLASS}>
              Go to section
            </a>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not yet approved</p>
      )}
    </section>
  );
}

/**
 * The client-approved estimate and SOW, always two slots. Props-driven: the
 * project page re-renders it after an approval, undo or revert (router.refresh),
 * so it updates without a full reload.
 */
export function ApprovedDocumentsPanel({ summary }: { summary: ApprovedDocumentsSummary }) {
  return (
    <SidebarPanel
      className="p-5"
      icon={
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M13 3l5 5v2"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="13" y="15" width="7" height="5.5" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M14.75 15v-1.25a1.75 1.75 0 0 1 3.5 0V15"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      }
      title="Approved documents"
      subtitle="Client-approved versions are locked. Changes need a change request."
    >
      <div className="mt-4 space-y-4">
        <Slot heading="Estimate" doc={summary.estimate} />
        <div className="border-t border-border" />
        <Slot heading="Statement of Work" doc={summary.sow} />
      </div>
    </SidebarPanel>
  );
}
