"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError } from "@/components/ui/FormError";
import { createProjectAction, getRateCardsForWorkstreamAction, type RateCardOption } from "./actions";

type BriefInputMode = "paste" | "upload";

export function NewProjectForm({
  workstreamOptions,
}: {
  workstreamOptions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(createProjectAction, undefined);
  const [briefMode, setBriefMode] = useState<BriefInputMode>("paste");
  const [workstreamId, setWorkstreamId] = useState("");
  const [rateCardOptions, setRateCardOptions] = useState<RateCardOption[]>([]);
  const [, startRateCardFetch] = useTransition();

  function handleWorkstreamChange(value: string) {
    setWorkstreamId(value);
    setRateCardOptions([]);
    if (!value) return;

    startRateCardFetch(async () => {
      const options = await getRateCardsForWorkstreamAction(value);
      setRateCardOptions(options);
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="workstreamId">Workstream</Label>
        <select
          id="workstreamId"
          name="workstreamId"
          value={workstreamId}
          onChange={(e) => handleWorkstreamChange(e.target.value)}
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
        <Label htmlFor="rateCardId">Rate card (optional)</Label>
        <select
          id="rateCardId"
          name="rateCardId"
          defaultValue=""
          disabled={rateCardOptions.length === 0}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring disabled:opacity-60"
        >
          <option value="">
            {workstreamId
              ? rateCardOptions.length === 0
                ? "No rate cards for this client"
                : "No rate card"
              : "Select a workstream first"}
          </option>
          {rateCardOptions.map((rc) => (
            <option key={rc.id} value={rc.id}>
              {rc.name} ({rc.currency})
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="brief">Brief</Label>
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
            id="brief"
            name="briefText"
            rows={8}
            placeholder="Paste the client brief here…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
        ) : (
          <input
            id="brief"
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
