"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

export interface VersionHistoryItem {
  id: string;
  versionNumber: number;
  status: "ENABLED" | "DISABLED";
  fileName: string;
  uploadedByName: string | null;
  uploadedAt: Date;
  /** Optional pre-formatted extra detail shown alongside date/uploader, e.g. an MSA/Rate Card's effective date range. */
  detail?: string;
}

export interface VersionActionState {
  message?: string;
}

type VersionAction = (
  prevState: VersionActionState | undefined,
  formData: FormData
) => Promise<VersionActionState | undefined>;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function RevertButton({ action }: { action: VersionAction }) {
  const [state, formAction, pending] = useActionState<VersionActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="shrink-0">
      {/* Uploads no longer auto-promote a new version to current (Rule 2/3
          audit gap fix) — this is the only way to change which version is
          flagged current, so it must read as a forward action, not a
          rollback, even though the Server Action underneath is still named
          "revert". */}
      <Button type="submit" variant="ghost" disabled={pending} className="text-xs">
        {pending ? "Setting as current…" : "Set as current version"}
      </Button>
      {state?.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}

function VersionRow({
  version,
  canManage,
  makeRevertAction,
}: {
  version: VersionHistoryItem;
  canManage: boolean;
  makeRevertAction: (versionId: string) => VersionAction;
}) {
  const isCurrent = version.status === "ENABLED";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-foreground">
          Version {version.versionNumber} — {version.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(version.uploadedAt)}
          {version.uploadedByName ? ` · ${version.uploadedByName}` : ""}
          {version.detail ? ` · ${version.detail}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            isCurrent ? "bg-success-bg text-success" : "bg-surface-muted text-muted-foreground"
          }`}
        >
          {isCurrent ? "Current" : "Disabled"}
        </span>
        {canManage && !isCurrent && <RevertButton action={makeRevertAction(version.id)} />}
      </div>
    </li>
  );
}

/**
 * One reusable version-history UI, shared across all three commercial
 * document types (Master Service Agreement, Rate Card, SOW Template) rather
 * than three separate implementations. Shows the current version
 * prominently, with the full history (including disabled versions and
 * revert actions) collapsed behind a <details> expand — the same
 * progressive-disclosure pattern already used for the Phase 1 workspace and
 * the Version History page, not a new interaction style.
 */
export function VersionHistory({
  title,
  versions,
  canManage,
  onUpload,
  makeRevertAction,
  fileLabel = "File",
  fileAccept = ".docx,.pdf,.pptx,.txt",
  emptyMessage = "No versions on file yet.",
  children,
}: {
  title: string;
  versions: VersionHistoryItem[];
  canManage: boolean;
  onUpload: VersionAction;
  makeRevertAction: (versionId: string) => VersionAction;
  fileLabel?: string;
  fileAccept?: string;
  emptyMessage?: string;
  /** Extra upload-form fields specific to this document type (e.g. effective dates) — rendered between the file input and the submit button. */
  children?: ReactNode;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [state, formAction, pending] = useActionState<VersionActionState | undefined, FormData>(
    onUpload,
    undefined
  );
  const fileInputId = useId();

  // Close the upload form only once a submission actually finishes
  // successfully — not merely once it settles. `state` alone can't
  // distinguish "never submitted" from "succeeded" (both are `undefined`,
  // since the action returns nothing on success), so track the
  // pending→settled transition explicitly and only close when that
  // transition didn't leave an error message behind.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.message) {
      setIsUploading(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const current = sorted.find((v) => v.status === "ENABLED") ?? null;
  const olderVersions = sorted.filter((v) => v.id !== current?.id);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {canManage && (
          <Button type="button" variant="secondary" onClick={() => setIsUploading((prev) => !prev)}>
            {isUploading ? "Cancel" : current ? "Upload new version" : "Upload"}
          </Button>
        )}
      </div>

      {current ? (
        <div className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{current.fileName}</p>
            <span className="shrink-0 rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success">
              Current
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {current.versionNumber} · {formatDateTime(current.uploadedAt)}
            {current.uploadedByName ? ` · ${current.uploadedByName}` : ""}
            {current.detail ? ` · ${current.detail}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {/* Only older (disabled) versions here — the current one is already
          shown prominently above, so it isn't duplicated in this list. */}
      {olderVersions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Version history ({olderVersions.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {olderVersions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                canManage={canManage}
                makeRevertAction={makeRevertAction}
              />
            ))}
          </ul>
        </details>
      )}

      {canManage && isUploading && (
        <form action={formAction} className="mt-4 space-y-3 border-t border-border pt-4">
          <div>
            <Label htmlFor={fileInputId}>{fileLabel}</Label>
            <input
              id={fileInputId}
              name="file"
              type="file"
              accept={fileAccept}
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          {children}
          {state?.message && (
            <p className="text-sm text-danger" role="alert">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : current ? "Upload new version" : "Upload"}
          </Button>
        </form>
      )}
    </Card>
  );
}
