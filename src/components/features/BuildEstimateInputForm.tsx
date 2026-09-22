"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MAP_CAPABILITIES, capabilityLabel } from "@/lib/mapCapabilities";
import {
  addOrReviseCapabilityInputAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { Capability } from "@/generated/prisma/enums";

type InputMode = "paste" | "upload";

export interface EstimateCapabilityInputView {
  capability: Capability | null;
  otherLabel: string | null;
  rawContent: string;
  sourceFileName: string | null;
}

/**
 * Captures one capability team's raw estimate input per project — paste or
 * upload, same UX as before, now wired to a real Server Action. Adding a
 * new capability and revising an already-captured one are the same form:
 * picking an already-captured capability prefills its existing content and
 * makes clear that submitting replaces it, matching
 * addOrReviseCapabilityInputAction's upsert-by-capability behavior.
 */
export function BuildEstimateInputForm({
  estimateId,
  existingInputs,
}: {
  estimateId: string;
  existingInputs: EstimateCapabilityInputView[];
}) {
  const action = addOrReviseCapabilityInputAction.bind(null, estimateId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const [capability, setCapability] = useState("");
  const [mode, setMode] = useState<InputMode>("paste");

  const existingByKey = new Map(existingInputs.map((input) => [input.capability ?? "OTHER", input]));
  const existingForSelected = capability ? existingByKey.get(capability) : undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Upload or paste the estimate you&apos;ve received back from each capability team here.
      </p>

      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor="estimate-capability"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Capability team
          </label>
          <select
            id="estimate-capability"
            name="capability"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Which capability is this estimate from?
            </option>
            {MAP_CAPABILITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {existingByKey.has(c.id) ? " (captured)" : ""}
              </option>
            ))}
            <option value="OTHER">Other{existingByKey.has("OTHER") ? " (captured)" : ""}</option>
          </select>
        </div>

        {existingForSelected && (
          <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground" role="status">
            This capability already has input captured — submitting below replaces it.
          </p>
        )}

        {capability === "OTHER" && (
          <div>
            <label
              htmlFor="estimate-other-label"
              className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Name the capability team
            </label>
            <input
              id="estimate-other-label"
              name="otherLabel"
              defaultValue={existingForSelected?.otherLabel ?? ""}
              placeholder="e.g. Legal & Compliance"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            />
          </div>
        )}

        <div className="flex gap-4 text-xs text-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="estimate-mode"
              checked={mode === "paste"}
              onChange={() => setMode("paste")}
            />
            Paste estimate
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="estimate-mode"
              checked={mode === "upload"}
              onChange={() => setMode("upload")}
            />
            Upload file
          </label>
        </div>

        {mode === "paste" ? (
          <textarea
            key={`content-${capability}`}
            name="content"
            aria-label="Estimate"
            rows={6}
            defaultValue={existingForSelected?.rawContent ?? ""}
            placeholder="Paste the estimate content here…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
        ) : (
          <input
            name="file"
            type="file"
            aria-label="Estimate file"
            accept=".docx,.pdf,.pptx,.xlsx,.txt"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        )}

        {state?.message && (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : existingForSelected ? "Update estimate input" : "Add estimate input"}
        </Button>
      </form>

      {existingInputs.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3 text-xs text-foreground">
          {existingInputs.map((input) => (
            <li key={input.capability ?? "OTHER"}>
              {input.capability ? capabilityLabel(input.capability) : input.otherLabel}
              {input.sourceFileName && (
                <span className="text-muted-foreground"> ({input.sourceFileName})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
