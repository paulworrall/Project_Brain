"use client";

import { useActionState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import {
  toggleChecklistItemAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import type { ChecklistItemView } from "./ChecklistView";

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
          defaultChecked={item.isComplete}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
          aria-label={item.label}
        />
      </form>
      <span className={item.isComplete ? "text-muted-foreground line-through" : "text-foreground"}>
        {item.label}
      </span>
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
      <p className="mt-1 text-xs text-muted-foreground">Tick items off as they&apos;re completed.</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No checklist items yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <EditableChecklistItem key={item.id} projectId={projectId} item={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}
