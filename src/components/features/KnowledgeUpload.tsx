"use client";

import { useActionState, useState } from "react";
import { SidebarPanel } from "./SidebarPanel";
import { Button } from "@/components/ui/Button";
import {
  uploadKnowledgeItemAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import { formatUkDateTime } from "@/lib/updateLabel";
import { VersionHistoryDrawer, type VersionView } from "./VersionHistoryDrawer";

export type { VersionView };

type InputMode = "paste" | "upload";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const latest = versions.at(-1);

  return (
    <SidebarPanel
      headingLevel={3}
      className="p-5"
      icon={
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      }
      title="Keep This Project Up to Date"
      subtitle={<>Got an update from the client or team? Add it here to keep everything current.</>}
    >
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

      {latest && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Latest:{" "}
          <span className="font-semibold text-foreground">
            {latest.versionNumber ? `v${latest.versionNumber}` : "—"}
          </span>{" "}
          · {formatUkDateTime(latest.createdAt)} ·{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            aria-haspopup="dialog"
            onClick={() => setHistoryOpen(true)}
          >
            View history ({versions.length})
          </button>
        </p>
      )}
      <VersionHistoryDrawer
        versions={versions}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </SidebarPanel>
  );
}
