"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { runTriageAgentAction, type ActionState } from "@/app/(dashboard)/projects/[projectId]/actions";

export function RunTriageAgentButton({ projectId }: { projectId: string }) {
  const action = runTriageAgentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Inputs ready — the updated Position Document is in. Run the Triage Agent to generate the
        Draft Scope Document.
      </p>
      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Running Triage Agent…" : "Run Triage Agent"}
      </Button>
    </form>
  );
}
