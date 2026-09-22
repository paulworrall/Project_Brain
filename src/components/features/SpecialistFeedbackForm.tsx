"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MAP_CAPABILITIES } from "@/lib/mapCapabilities";
import {
  submitSpecialistFeedbackAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export function SpecialistFeedbackForm({ projectId }: { projectId: string }) {
  const action = submitSpecialistFeedbackAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const [capability, setCapability] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="capability"
          className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Capability team
        </label>
        <select
          id="capability"
          name="capability"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="" disabled>
            Which capability is this feedback from?
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
            htmlFor="otherLabel"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Name the capability team
          </label>
          <Input
            id="otherLabel"
            name="otherLabel"
            placeholder="e.g. Legal & Compliance"
            required
            className="mt-1"
          />
        </div>
      )}

      <label
        htmlFor="feedback"
        className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Capability Feedback
      </label>
      <textarea
        id="feedback"
        name="feedback"
        rows={6}
        placeholder="Paste the specialist leads' feedback on the Draft Scope Document here…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      />
      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Processing feedback…" : "Submit Specialist Feedback"}
      </Button>
    </form>
  );
}
