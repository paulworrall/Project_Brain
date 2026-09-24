"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  updatePmPerspectiveFieldAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import type { PmPerspectiveFieldView } from "@/lib/pmPerspectiveStore";

function formatEdited(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PmPerspectiveFieldEditor({
  projectId,
  field,
}: {
  projectId: string;
  field: PmPerspectiveFieldView;
}) {
  const action = updatePmPerspectiveFieldAction.bind(null, projectId, field.id);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const inputId = `pm-perspective-edit-${field.id}`;

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        {field.label}
      </label>
      <textarea
        id={inputId}
        name="content"
        rows={3}
        defaultValue={field.content}
        aria-describedby={`${inputId}-helper`}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      />
      <p id={`${inputId}-helper`} className="text-xs text-muted-foreground">
        {field.helper}
      </p>
      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/**
 * The PM's own view of the brief — its own clearly labelled panel, styled
 * apart from everything that came from the client. Editable at any time;
 * each field shows who last edited it and when.
 */
export function PmPerspectivePanel({
  projectId,
  fields,
}: {
  projectId: string;
  fields: PmPerspectiveFieldView[];
}) {
  const filledCount = fields.filter((f) => f.content).length;

  return (
    <section
      aria-labelledby="pm-perspective-heading"
      className="space-y-4 rounded-lg border border-accent-foreground/30 bg-accent p-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="pm-perspective-heading" className="text-sm font-semibold text-accent-foreground">
            PM perspective
          </h3>
          <span className="rounded-full border border-accent-foreground/40 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
            PM&apos;s view — not from the client
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {filledCount === 0
            ? "Add your own read of the brief — it helps the agents ask better questions. Nothing here is ever presented as the client's words."
            : `${filledCount} of ${fields.length} filled in. Nothing here is ever presented as the client's words.`}
        </p>
      </div>

      <dl className="space-y-3">
        {fields.map((field) => (
          <div
            key={field.id}
            className="border-t border-accent-foreground/20 pt-3 first:border-t-0 first:pt-0"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">
              {field.label}
            </dt>
            <dd className="mt-1 space-y-1">
              {field.content ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">{field.content}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">{field.helper}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {field.updatedAt
                  ? `Last edited ${formatEdited(field.updatedAt)}${field.updatedByName ? ` by ${field.updatedByName}` : ""}`
                  : "Not added yet"}
              </p>
              {/* Remount after a save so the editor closes with fresh content. */}
              <Disclosure
                key={field.updatedAt ? new Date(field.updatedAt).toISOString() : "new"}
                summary={field.content ? "Edit" : "Add →"}
              >
                <PmPerspectiveFieldEditor projectId={projectId} field={field} />
              </Disclosure>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
