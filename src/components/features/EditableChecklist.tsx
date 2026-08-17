"use client";

import { useActionState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import {
  toggleChecklistItemAction,
  updateChecklistItemDetailAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import type { ChecklistItemView } from "./ChecklistView";

function ChecklistItemDetailField({
  projectId,
  item,
}: {
  projectId: string;
  item: ChecklistItemView;
}) {
  const action = updateChecklistItemDetailAction.bind(null, projectId, item.id);
  const [state, formAction] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex-1">
      <input
        type="text"
        name="detailText"
        defaultValue={item.detailText ?? ""}
        placeholder="Add detail (e.g. job code, folder URL)…"
        aria-label={`${item.label} detail`}
        onBlur={() => formRef.current?.requestSubmit()}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      />
      {state?.message && <p className="mt-1 text-xs text-danger">{state.message}</p>}
    </form>
  );
}

function EditableChecklistItem({
  projectId,
  item,
}: {
  projectId: string;
  item: ChecklistItemView;
}) {
  const action = toggleChecklistItemAction.bind(null, projectId, item.id);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <li className="flex items-center gap-2 text-sm">
      <form ref={formRef} action={formAction}>
        <input
          type="checkbox"
          name="isComplete"
          checked={item.isComplete}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
          aria-label={item.label}
        />
      </form>
      <span
        className={`shrink-0 ${item.isComplete ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {item.label}
      </span>
      <ChecklistItemDetailField projectId={projectId} item={item} />
      {state?.message && <span className="text-xs text-danger">{state.message}</span>}
    </li>
  );
}

export function EditableChecklist({
  projectId,
  items,
}: {
  projectId: string;
  items: ChecklistItemView[];
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">Project Set-Up Checklist</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick items off as they&apos;re completed — the detail field is always editable, whether or
        not the box is ticked yet.
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No checklist items yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            // Keying on isComplete/detailText (not just id) forces a full
            // remount when either changes — from either this instance's own
            // action or another instance's, since this checklist renders in
            // two places at once (Phase 1 workspace and the sidebar) bound
            // to the same server data. Without it, a component clicked
            // mid-flight can hold onto its own useActionState pending/value
            // timing and end up showing stale state relative to the copy
            // that didn't trigger the action, even after the shared props
            // have updated.
            <EditableChecklistItem
              key={`${item.id}-${item.isComplete}-${item.detailText ?? ""}`}
              projectId={projectId}
              item={item}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
