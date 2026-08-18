"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  startSowDevelopmentAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface SowTemplateSelectOption {
  id: string;
  name: string;
  isBaseline: boolean;
}

/**
 * "Start SOW development" entry point (Stage 8 — Commercials & SOW). Lets a
 * PM select which SOW Template to use — the global baseline plus only their
 * Project's own Client's variants (scoped server-side in
 * getSOWTemplatesForClientAction, same isolation guarantee as Rate Cards).
 * The actual SOW-generation agent that would consume this selection is
 * future/Level 3 scope, so "Generate SOW" stays a disabled placeholder —
 * this panel only records which template to use once that agent exists.
 */
export function StartSowDevelopmentPanel({
  projectId,
  currentTemplate,
  templateOptions,
}: {
  projectId: string;
  currentTemplate: { id: string; name: string } | null;
  templateOptions: SowTemplateSelectOption[];
}) {
  const action = startSowDevelopmentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor="sowTemplateId"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            SOW Template
          </label>
          <select
            id="sowTemplateId"
            name="sowTemplateId"
            defaultValue={currentTemplate?.id ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Select a SOW Template…
            </option>
            {templateOptions.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isBaseline ? " (baseline)" : ""}
              </option>
            ))}
          </select>
        </div>
        {state?.message && (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : currentTemplate ? "Change SOW Template" : "Start SOW development"}
        </Button>
      </form>

      {currentTemplate && (
        <p className="text-sm text-muted-foreground">
          Using <span className="font-medium text-foreground">{currentTemplate.name}</span>.
        </p>
      )}

      <div className="border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">
          SOW generation from this template is coming in a future release.
        </p>
        <button
          type="button"
          disabled
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground opacity-50"
        >
          Generate SOW
        </button>
      </div>
    </div>
  );
}
