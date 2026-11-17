import { Disclosure } from "@/components/ui/Disclosure";
import { DocumentStatusBadge } from "@/components/ui/DocumentStatusBadge";
import { formatApprovalDate } from "@/lib/commercial/approvalCopy";
import { formatMoney } from "@/lib/formatMoney";
import { formatUkDateTime } from "@/lib/updateLabel";
import type { SowVersionMeta } from "./StartSowDevelopmentPanel";

/**
 * FB-012: what the SOW step shows once the project is complete (the SOW is
 * client approved) — no template or version selectors and no Regenerate. Just
 * the approved version as a compact card (badge, date, approver, download) and
 * a collapsed "Project history" with the earlier versions. The one "Locked…"
 * line lives with the success block under the stepper, not here.
 */
export function CompletedSowSummary({
  projectId,
  sowVersions,
}: {
  projectId: string;
  sowVersions: SowVersionMeta[];
}) {
  const approved = sowVersions.find((v) => v.approvalState === "approved") ?? sowVersions[0];
  const earlier = sowVersions.filter((v) => v.id !== approved?.id);
  if (!approved) return null;
  return (
    <div id="sow" className="scroll-mt-6 space-y-4">
      <div className="space-y-2 border border-border bg-surface p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <span>Version {approved.versionNumber}</span>
          <DocumentStatusBadge
            state={approved.approvalState ?? "approved"}
            approvedOn={approved.approval?.clientApprovedOn}
          />
        </p>
        {approved.approval && (
          <p className="text-xs text-muted-foreground">
            Approved by {approved.approval.clientApproverName} on{" "}
            {formatApprovalDate(approved.approval.clientApprovedOn)}
          </p>
        )}
        {approved.sourceEstimateVersionNumber != null && approved.total != null && approved.currency && (
          <p className="text-xs text-muted-foreground">
            From Estimate v{approved.sourceEstimateVersionNumber} — {formatMoney(approved.total, approved.currency)}
          </p>
        )}
        <a
          href={`/api/projects/${projectId}/sow/${approved.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Download .docx
        </a>
      </div>

      {earlier.length > 0 && (
        <Disclosure summary={<span className="text-sm font-medium text-foreground">Project history</span>}>
          <ul className="mt-3 divide-y divide-border">
            {earlier.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-foreground"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    Version {version.versionNumber} · {formatUkDateTime(version.createdAt)}
                  </span>
                  <DocumentStatusBadge
                    state={version.approvalState ?? "superseded"}
                    approvedOn={version.approval?.clientApprovedOn}
                  />
                </span>
                <a
                  href={`/api/projects/${projectId}/sow/${version.id}`}
                  className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
