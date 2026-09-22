"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MAP_CAPABILITIES } from "@/lib/mapCapabilities";

type InputMode = "paste" | "upload";

/**
 * Front-end only for now, by design — the PM asked to confirm this shape on
 * the live site before "the estimate building functionality" (add-to-or-
 * renew, version tracking) gets designed in a follow-up. Submission is
 * intentionally disabled rather than silently no-op'd, same convention as
 * this app's other not-yet-built steps (see PlaceholderStepContent) — no
 * saved data quietly goes nowhere.
 */
export function BuildEstimateInputForm() {
  const [capability, setCapability] = useState("");
  const [mode, setMode] = useState<InputMode>("paste");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Upload or paste the estimate you&apos;ve received back from each capability team here.
      </p>

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
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
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Which capability is this estimate from?
            </option>
            {MAP_CAPABILITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value="OTHER">Other</option>
          </select>
        </div>

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
            name="content"
            aria-label="Estimate"
            rows={6}
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

        <Button type="submit" disabled className="w-full">
          Save estimate — coming soon
        </Button>
        <p className="text-xs text-muted-foreground">
          This form is a preview of the input — saving, updating and version tracking for
          estimates is being designed next.
        </p>
      </form>
    </div>
  );
}
