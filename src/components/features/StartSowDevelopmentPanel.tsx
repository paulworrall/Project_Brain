"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  startSowDevelopmentAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export interface SowTemplateVersionSelectOption {
  id: string;
  versionNumber: number;
  fileName: string;
  status: "ENABLED" | "DISABLED";
}

export interface SowTemplateSelectOption {
  id: string;
  name: string;
  isBaseline: boolean;
  // Every version of this template, newest first — Rule 2 (audit gap):
  // versions don't supersede, so every one stays pickable, not just
  // whichever is flagged current.
  versions: SowTemplateVersionSelectOption[];
}

function defaultVersionId(template: SowTemplateSelectOption | undefined): string {
  if (!template) return "";
  const flaggedCurrent = template.versions.find((v) => v.status === "ENABLED");
  return (flaggedCurrent ?? template.versions[0])?.id ?? "";
}

/**
 * "Start SOW development" entry point (Stage 8 — Commercials & SOW). Lets a
 * PM select which SOW Template to use — the global baseline plus only their
 * Project's own Client's variants (scoped server-side in
 * getSOWTemplatesForClientAction, same isolation guarantee as Rate Cards) —
 * and, dependently, which of that template's versions (Rule 2 audit gap:
 * versions don't supersede, so every version stays independently pickable,
 * pre-selecting whichever is flagged current). The actual SOW-generation
 * agent that would consume this selection is future/Level 3 scope, so
 * "Generate SOW" stays a disabled placeholder — this panel only records
 * which template + version to use once that agent exists.
 */
export function StartSowDevelopmentPanel({
  projectId,
  currentTemplate,
  currentTemplateVersion,
  templateOptions,
}: {
  projectId: string;
  currentTemplate: { id: string; name: string } | null;
  currentTemplateVersion: { id: string } | null;
  templateOptions: SowTemplateSelectOption[];
}) {
  const action = startSowDevelopmentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(currentTemplate?.id ?? "");
  const selectedTemplate = templateOptions.find((t) => t.id === selectedTemplateId);
  // Pre-select the Project's own recorded version if it still belongs to
  // the currently-selected template; otherwise fall back to whichever
  // version is flagged current for that template.
  const [selectedVersionId, setSelectedVersionId] = useState(() => {
    if (currentTemplateVersion && selectedTemplate?.versions.some((v) => v.id === currentTemplateVersion.id)) {
      return currentTemplateVersion.id;
    }
    return defaultVersionId(selectedTemplate);
  });

  function handleTemplateChange(value: string) {
    setSelectedTemplateId(value);
    setSelectedVersionId(defaultVersionId(templateOptions.find((t) => t.id === value)));
  }

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
            value={selectedTemplateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
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

        {selectedTemplate && (
          <div>
            <label
              htmlFor="sowTemplateVersionId"
              className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Version
            </label>
            <select
              id="sowTemplateVersionId"
              name="sowTemplateVersionId"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            >
              <option value="" disabled>
                Select a version…
              </option>
              {selectedTemplate.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber} — {version.fileName}
                  {version.status === "ENABLED" ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

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
