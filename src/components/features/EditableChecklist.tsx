"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import {
  toggleChecklistItemAction,
  updateChecklistItemDetailAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import {
  addChecklistItemAction,
  setChecklistItemStepAction,
} from "@/app/(dashboard)/projects/[projectId]/step-actions";
import { PROJECT_STEPS, type StepId } from "@/lib/projectSteps";
import type { SystemCheck } from "@/lib/project/readiness";
import type { ChecklistItemView } from "./ChecklistView";

/**
 * A step's "Before you move on" list (FB-008): derived, read-only system
 * checks first, then the PM's own checklist items for this step — tick, edit
 * the detail, move to another step, or add a new one. Once the project is
 * complete everything is read-only.
 */

function CheckIcon({ met }: { met: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      {met ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" className="text-primary" />
          <path
            d="M4.5 8.2l2.3 2.3 4.7-4.9"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground"
        />
      )}
    </svg>
  );
}

function SystemCheckRow({ check }: { check: SystemCheck }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <CheckIcon met={check.met} />
      <span className="text-foreground">{check.label}</span>
      <span className="text-xs text-muted-foreground">
        {check.met ? "Done" : "Not yet"}
        <span className="sr-only"> (checked automatically)</span>
      </span>
    </li>
  );
}

function ChecklistItemDetailField({
  projectId,
  item,
  readOnly,
}: {
  projectId: string;
  item: ChecklistItemView;
  readOnly: boolean;
}) {
  const action = updateChecklistItemDetailAction.bind(null, projectId, item.id);
  const [state, formAction] = useActionState<ActionState | undefined, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="min-w-40 flex-1">
      <input
        type="text"
        name="detailText"
        defaultValue={item.detailText ?? ""}
        placeholder="Add detail (e.g. job code, folder URL)…"
        aria-label={`${item.label} detail`}
        readOnly={readOnly}
        onBlur={() => {
          if (!readOnly) formRef.current?.requestSubmit();
        }}
        className="w-full border border-border-strong bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground read-only:border-border read-only:bg-surface-muted"
      />
      {state?.message && <p className="mt-1 text-xs text-danger">{state.message}</p>}
    </form>
  );
}

function ChecklistItemStepField({
  projectId,
  item,
  readOnly,
}: {
  projectId: string;
  item: ChecklistItemView;
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        aria-label={`Step for ${item.label}`}
        value={item.step ?? "brief"}
        disabled={readOnly || pending}
        onChange={(event) => {
          const step = event.target.value;
          setError(null);
          startTransition(async () => {
            const result = await setChecklistItemStepAction({ projectId, itemId: item.id, step });
            if (!result.ok) setError(result.message);
          });
        }}
        className="border border-border-strong bg-surface px-1.5 py-1 text-xs text-foreground disabled:border-border disabled:text-muted-foreground"
      >
        {PROJECT_STEPS.map((step) => (
          <option key={step.id} value={step.id}>
            {step.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </>
  );
}

function EditableChecklistItem({
  projectId,
  item,
  readOnly,
  showStepField,
}: {
  projectId: string;
  item: ChecklistItemView;
  readOnly: boolean;
  showStepField: boolean;
}) {
  const action = toggleChecklistItemAction.bind(null, projectId, item.id);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <form ref={formRef} action={formAction} className="flex items-center">
        <input
          type="checkbox"
          name="isComplete"
          checked={item.isComplete}
          disabled={pending || readOnly}
          onChange={() => formRef.current?.requestSubmit()}
          aria-label={item.label}
          className="h-4 w-4"
        />
      </form>
      <span
        className={`shrink-0 ${item.isComplete ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {item.label}
      </span>
      <ChecklistItemDetailField projectId={projectId} item={item} readOnly={readOnly} />
      {showStepField && (
        <ChecklistItemStepField projectId={projectId} item={item} readOnly={readOnly} />
      )}
      {state?.message && <span className="text-xs text-danger">{state.message}</span>}
    </li>
  );
}

function AddChecklistItemForm({ projectId, step }: { projectId: string; step: StepId }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addChecklistItemAction({ projectId, label, step });
          if (result.ok) setLabel("");
          else setError(result.fieldErrors?.label ?? result.message);
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        New item
      </label>
      <input
        id={inputId}
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Add an item…"
        className="min-w-40 flex-1 border border-border-strong bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={pending || !label.trim()}
        className="min-h-8 border border-primary bg-surface px-3 py-1 text-xs font-medium text-primary hover:bg-line-soft disabled:border-border disabled:text-muted-foreground"
      >
        {pending ? "Adding…" : "Add item"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function EditableChecklist({
  projectId,
  items,
  step = "brief",
  systemChecks = [],
  readOnly = false,
  title = "Before you move on",
}: {
  projectId: string;
  /** This step's items only. */
  items: ChecklistItemView[];
  step?: StepId;
  /** Derived, read-only checks shown above the PM's items. */
  systemChecks?: SystemCheck[];
  /** The project is complete: nothing can be ticked, edited, moved or added. */
  readOnly?: boolean;
  title?: string;
}) {
  const headingId = useId();
  const hasAnything = items.length > 0 || systemChecks.length > 0;
  return (
    <section aria-labelledby={headingId} className="border border-border bg-surface px-4 py-3">
      <h3 id={headingId} className="text-sm font-medium text-foreground">
        {title}
      </h3>
      {!hasAnything ? (
        <p className="mt-2 text-sm text-muted-foreground">No checklist items yet.</p>
      ) : (
        <>
          {systemChecks.length > 0 && (
            <ul aria-label="Automatic checks" className="mt-2 space-y-1.5">
              {systemChecks.map((check) => (
                <SystemCheckRow key={check.id} check={check} />
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <ul aria-label="Checklist items" className="mt-2 space-y-2">
              {items.map((item) => (
                // Keyed on isComplete/detailText too, so a refresh after another
                // action remounts the row instead of keeping stale local state.
                <EditableChecklistItem
                  key={`${item.id}-${item.isComplete}-${item.detailText ?? ""}-${item.step ?? ""}`}
                  projectId={projectId}
                  item={item}
                  readOnly={readOnly}
                  showStepField={!readOnly}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {!readOnly && <AddChecklistItemForm projectId={projectId} step={step} />}
    </section>
  );
}
