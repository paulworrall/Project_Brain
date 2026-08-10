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
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">Additional Inputs</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload documents or notes anytime — the chatbot answers using these too.
      </p>

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

        <Button type="submit" disabled={pending} variant="secondary" className="w-full">
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
