"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  submitClientUpdateAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface ClientUpdateLogEntry {
  id: string;
  content: string;
  createdAt: Date;
  createdByName: string | null;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ClientUpdateForm({ projectId }: { projectId: string }) {
  const action = submitClientUpdateAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-2">
      <label
        htmlFor="notes"
        className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Add a client update
      </label>
      <textarea
        id="notes"
        name="notes"
        rows={4}
        placeholder="Paste the client's latest reply, a call summary, or any other update…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      />
      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Processing update…" : "Add update"}
      </Button>
    </form>
  );
}

function UpdateEntry({ update }: { update: ClientUpdateLogEntry }) {
  return (
    <li className="text-sm">
      <p className="text-xs text-muted-foreground">
        {formatDateTime(update.createdAt)}
        {update.createdByName ? ` · ${update.createdByName}` : ""}
      </p>
      <p className="whitespace-pre-wrap text-foreground">{update.content}</p>
    </li>
  );
}

export function ClientUpdateComposer({
  projectId,
  updates,
}: {
  projectId: string;
  updates: ClientUpdateLogEntry[];
}) {
  const [mostRecent, ...rest] = updates;

  return (
    <Card className="p-5">
      {/* Keyed on the log length so a successful submission (which grows the
          log via revalidatePath) remounts the form and clears the textarea,
          while a failed submission (log unchanged) preserves what was typed. */}
      <ClientUpdateForm key={updates.length} projectId={projectId} />

      {mostRecent && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Previous updates
          </h4>
          <ul className="mt-2 space-y-3">
            <UpdateEntry update={mostRecent} />
          </ul>

          {rest.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-primary">
                View all updates ({updates.length})
              </summary>
              <ul className="mt-2 space-y-3">
                {rest.map((update) => (
                  <UpdateEntry key={update.id} update={update} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
