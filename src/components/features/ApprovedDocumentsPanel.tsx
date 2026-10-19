import { Card } from "@/components/ui/Card";
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
    <Card className="space-y-4 p-4">
      <h3 className="text-sm font-semibold text-foreground">Approved documents</h3>
      <Slot heading="Estimate" doc={summary.estimate} />
      <div className="border-t border-border" />
      <Slot heading="Statement of Work" doc={summary.sow} />
    </Card>
  );
}
