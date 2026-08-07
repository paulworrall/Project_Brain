"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
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

  return (
    <form action={formAction} className="space-y-3">
      <label
        htmlFor="feedback"
        className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Specialist Lead Feedback
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
