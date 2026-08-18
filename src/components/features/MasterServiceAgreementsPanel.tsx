"use client";

import { Label } from "@/components/ui/Label";
import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import {
  uploadMasterServiceAgreementVersionAction,
  revertMasterServiceAgreementVersionAction,
} from "@/app/(dashboard)/clients/[clientId]/actions";

export interface MasterServiceAgreementVersionView extends VersionHistoryItem {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

/**
 * Uploading a new version and reverting to a previous one are restricted to
 * the ClientEngagement role, enforced server-side in
 * uploadMasterServiceAgreementVersionAction/revertMasterServiceAgreementVersionAction
 * themselves — `canManage` only hides the controls as a UX nicety. Uses the
 * shared VersionHistory component (see src/components/features/VersionHistory.tsx)
 * rather than a bespoke MSA-only implementation.
 */
export function MasterServiceAgreementsPanel({
  clientId,
  versions,
  canManage,
}: {
  clientId: string;
  versions: MasterServiceAgreementVersionView[];
  canManage: boolean;
}) {
  const items: VersionHistoryItem[] = versions.map((v) => ({
    ...v,
    detail: `${formatDate(v.effectiveFrom)} – ${formatDate(v.effectiveTo)}`,
  }));

  return (
    <VersionHistory
      title="Master Service Agreement"
      versions={items}
      canManage={canManage}
      fileLabel="MSA file"
      emptyMessage="No MSA on file yet."
      onUpload={uploadMasterServiceAgreementVersionAction.bind(null, clientId)}
      makeRevertAction={(versionId) =>
        revertMasterServiceAgreementVersionAction.bind(null, clientId, versionId)
      }
    >
      <div className="flex flex-wrap gap-3">
        <div>
          <Label htmlFor="msaEffectiveFrom">Effective from</Label>
          <input
            id="msaEffectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div>
          <Label htmlFor="msaEffectiveTo">Effective to (optional)</Label>
          <input
            id="msaEffectiveTo"
            name="effectiveTo"
            type="date"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>
    </VersionHistory>
  );
}
