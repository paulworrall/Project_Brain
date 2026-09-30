"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  uploadKnowledgeItemAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import { formatUkDateTime } from "@/lib/updateLabel";
import type { VersionEntry } from "@/lib/updateVersions";

/** One version of the brief (v1 the brief, then each update), as getVersionHistory returns it. */
export type VersionView = Omit<VersionEntry, "content">;

type InputMode = "paste" | "upload";

const SOURCE_LABEL: Record<VersionView["source"], string> = {
  CLIENT: "Client",
  INTERNAL_TEAM: "Internal team",
};

export function KnowledgeUpload({
  projectId,
  versions,
}: {
  projectId: string;
  /** Oldest first; shown newest first. */
  versions: VersionView[];
}) {
  const action = uploadKnowledgeItemAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const [mode, setMode] = useState<InputMode>("paste");

  return (
    <Card variant="feature" className="p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M12 8v8M8 12h8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">Keep This Project Up to Date</h3>
          <p className="text-xs text-muted-foreground">
            Got an update from the client or team? Add it here to keep everything current.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-3 space-y-2">
        <div
          role="radiogroup"
          aria-labelledby="update-source-label"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground"
        >
          <span id="update-source-label" className="font-medium">
            From
          </span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="source" value="CLIENT" defaultChecked />
            Client
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="source" value="INTERNAL_TEAM" />
            Internal team
          </label>
        </div>

        <div className="flex gap-4 text-xs text-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="mode"
              checked={mode === "paste"}
              onChange={() => setMode("paste")}
            />
            Paste notes
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="mode"
              checked={mode === "upload"}
              onChange={() => setMode("upload")}
            />
            Upload file
          </label>
        </div>

        {mode === "paste" ? (
          <textarea
            name="content"
            aria-label="Notes"
            rows={3}
            placeholder="Paste meeting notes or other context…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
        ) : (
          <input
            name="file"
            type="file"
            aria-label="File"
            accept=".docx,.pdf,.pptx,.txt"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        )}

        {state?.message && (
          <p className="text-xs text-danger" role="alert">
            {state.message}
          </p>
        )}
        {state?.notice && (
          <p className="text-xs text-muted-foreground" role="status">
            {state.notice}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>

      {versions.length > 0 && (
        <ul
          aria-label="Version history"
          className="mt-4 space-y-2.5 border-t border-border pt-3"
        >
          {[...versions].reverse().map((version) => (
            <li key={version.id} className="text-xs text-foreground">
              <p>
                <span className="font-semibold text-primary">
                  {version.versionNumber ? `v${version.versionNumber}` : "—"}
                </span>{" "}
                {version.label}
              </p>
              <p className="text-muted-foreground">
                {SOURCE_LABEL[version.source]}
                {/* An untitled update's label already carries its date. */}
                {!version.label.startsWith("Update — ") && ` · ${formatUkDateTime(version.createdAt)}`}
                {version.detail && ` · ${version.detail}`}
              </p>
              {version.summary && <p className="mt-0.5 text-foreground/80">{version.summary}</p>}
              {version.changeSummary && (
                <p className="mt-0.5 text-muted-foreground">Changed: {version.changeSummary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
