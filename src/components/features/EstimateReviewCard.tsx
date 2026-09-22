"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  saveEstimateVersionAction,
  type SaveEstimateVersionActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { EstimateDocumentContent } from "@/types/estimates";

/**
 * The read-only generated preview — generate -> review -> Regenerate ->
 * download, matching ClarificationEmailCard/DraftScopeDocumentCard.
 * "Regenerate" isn't a control here at all: it's the same "Analyze & build"
 * trigger one level up in EstimateBuildWorkspace, since re-analyzing is what
 * produces a fresh version of this content. No inline editing anywhere —
 * the editable surface for this feature is RoleResolutionReview's dropdown,
 * not this document.
 */
export function EstimateReviewCard({
  projectId,
  estimateId,
  content,
}: {
  projectId: string;
  estimateId: string;
  content: EstimateDocumentContent;
}) {
  const action = saveEstimateVersionAction.bind(null, estimateId);
  const [state, formAction, pending] = useActionState<
    SaveEstimateVersionActionState | undefined,
    FormData
  >(action, undefined);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Review</h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-foreground sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Client</dt>
            <dd>{content.overview.clientName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd>{content.overview.projectName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project code</dt>
            <dd>{content.overview.projectCode ?? "Not yet set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Generated</dt>
            <dd>{content.overview.generatedDate}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Rate card</dt>
            <dd>
              {content.overview.rateCardName} (version {content.overview.rateCardVersionNumber})
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        {content.capabilitySections.map((section) => (
          <div key={section.capability}>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {capabilityLabel(section.capability)}
            </h5>
            <table className="mt-1 w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Role</th>
                  <th className="py-1 pr-2 font-medium">Level</th>
                  <th className="py-1 pr-2 font-medium">Rate</th>
                  <th className="py-1 pr-2 font-medium">Fee</th>
                </tr>
              </thead>
              <tbody>
                {section.lineItems.map((line, i) => (
                  <tr key={i} className="border-b border-border text-foreground">
                    <td className="py-1 pr-2">{line.role}</td>
                    <td className="py-1 pr-2">{line.level ?? "—"}</td>
                    <td className="py-1 pr-2">
                      {line.rate.toFixed(2)} / {line.rateType.toLowerCase()}
                    </td>
                    <td className="py-1 pr-2">{line.feeSubtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs font-medium text-foreground">
              Subtotal: {section.subtotal.toFixed(2)} {content.currency}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm font-semibold text-foreground">
          Total: {content.totalValue.toFixed(2)} {content.currency}
        </p>
        <form action={formAction}>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save as version"}
          </Button>
        </form>
      </div>

      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      {state?.versionId && (
        <p className="text-xs text-success" role="status">
          Saved.{" "}
          <a
            href={`/api/projects/${projectId}/estimates/${estimateId}/versions/${state.versionId}`}
            className="font-medium text-primary hover:underline"
          >
            Download .docx →
          </a>
        </p>
      )}
    </Card>
  );
}
