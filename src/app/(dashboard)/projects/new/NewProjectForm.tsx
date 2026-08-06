"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError } from "@/components/ui/FormError";
import { createProjectAction } from "./actions";

type BriefInputMode = "paste" | "upload";

export function NewProjectForm({
  workstreamOptions,
}: {
  workstreamOptions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(createProjectAction, undefined);
  const [briefMode, setBriefMode] = useState<BriefInputMode>("paste");

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="workstreamId">Workstream</Label>
        <select
          id="workstreamId"
          name="workstreamId"
          defaultValue=""
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="" disabled>
            Select a workstream…
          </option>
          {workstreamOptions.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.label}
            </option>
          ))}
        </select>
        <FormError>{state?.errors?.workstreamId}</FormError>
      </div>

      <div>
        <Label htmlFor="name">Project name</Label>
        <Input id="name" name="name" type="text" required />
        <FormError>{state?.errors?.name}</FormError>
      </div>

      <div>
        <Label>Brief</Label>
        <div className="mb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="briefMode"
              checked={briefMode === "paste"}
              onChange={() => setBriefMode("paste")}
            />
            Paste text
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="briefMode"
              checked={briefMode === "upload"}
              onChange={() => setBriefMode("upload")}
            />
            Upload file
          </label>
        </div>

        {briefMode === "paste" ? (
          <textarea
            name="briefText"
            rows={8}
            placeholder="Paste the client brief here…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
        ) : (
          <input
            name="briefFile"
            type="file"
            accept=".docx,.pdf,.pptx,.txt"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        )}
        <FormError>{state?.errors?.briefText}</FormError>
      </div>

      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Running Intake Agent…" : "Create project"}
      </Button>
    </form>
  );
}
