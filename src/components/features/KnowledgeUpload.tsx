"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  uploadKnowledgeItemAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface KnowledgeItemView {
  id: string;
  type: "DOCUMENT" | "NOTE";
  title: string;
  originalFileName: string | null;
}

type InputMode = "paste" | "upload";

export function KnowledgeUpload({
  projectId,
  items,
}: {
  projectId: string;
  items: KnowledgeItemView[];
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
        <Input
          name="title"
          aria-label="Title"
          placeholder="Title, e.g. Client call notes — 12 Aug"
          required
        />

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

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>

      {items.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
          {items.map((item) => (
            <li key={item.id} className="text-xs text-foreground">
              {item.title}{" "}
              <span className="text-muted-foreground">
                ({item.type === "DOCUMENT" ? item.originalFileName ?? "Document" : "Note"})
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
