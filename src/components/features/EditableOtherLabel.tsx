"use client";

import { useActionState, useState } from "react";
import {
  updateOtherServiceLabelAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

export function EditableOtherLabel({
  projectId,
  label,
}: {
  projectId: string;
  label: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const action = updateOtherServiceLabelAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  if (isEditing) {
    return (
      <form
        action={async (formData) => {
          await formAction(formData);
          setIsEditing(false);
        }}
        className="flex items-center gap-2"
      >
        <input
          name="otherLabel"
          type="text"
          aria-label="Other service label"
          defaultValue={label}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-semibold text-foreground"
        />
        <button type="submit" disabled={pending} className="text-xs font-medium text-primary">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={pending}
          className="text-xs font-medium text-muted-foreground"
        >
          Cancel
        </button>
        {state?.message && <p className="text-xs text-danger">{state.message}</p>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="text-sm font-semibold text-foreground underline decoration-dotted"
      title="Edit label"
    >
      {label}
    </button>
  );
}
