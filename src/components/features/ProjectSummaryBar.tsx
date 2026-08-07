"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  updateProjectSummaryAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

const NOT_SET = "Not yet set";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDate(date: Date | null): string {
  if (!date) return NOT_SET;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

export interface ProjectManagerOption {
  id: string;
  name: string;
}

interface ProjectSummaryBarProps {
  projectId: string;
  status: "ACTIVE" | "COMPLETE";
  jobCode: string | null;
  kickOffDate: Date | null;
  targetCompletionDate: Date | null;
  projectManager: ProjectManagerOption | null;
  projectManagerOptions: ProjectManagerOption[];
}

export function ProjectSummaryBar({
  projectId,
  status,
  jobCode,
  kickOffDate,
  targetCompletionDate,
  projectManager,
  projectManagerOptions,
}: ProjectSummaryBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const action = updateProjectSummaryAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  if (isEditing) {
    return (
      <Card className="p-4">
        <form
          action={async (formData) => {
            await formAction(formData);
            setIsEditing(false);
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <div>
            <label htmlFor="jobCode" className="block text-xs font-medium text-muted-foreground">
              Job Code
            </label>
            <input
              id="jobCode"
              name="jobCode"
              type="text"
              defaultValue={jobCode ?? ""}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="kickOffDate" className="block text-xs font-medium text-muted-foreground">
              Kick-off Date
            </label>
            <input
              id="kickOffDate"
              name="kickOffDate"
              type="date"
              defaultValue={toDateInputValue(kickOffDate)}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="targetCompletionDate"
              className="block text-xs font-medium text-muted-foreground"
            >
              Target Completion
            </label>
            <input
              id="targetCompletionDate"
              name="targetCompletionDate"
              type="date"
              defaultValue={toDateInputValue(targetCompletionDate)}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="projectManagerId"
              className="block text-xs font-medium text-muted-foreground"
            >
              Project Manager
            </label>
            <select
              id="projectManagerId"
              name="projectManagerId"
              defaultValue={projectManager?.id ?? ""}
              className="mt-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
            >
              <option value="">Unassigned</option>
              {projectManagerOptions.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" onClick={() => setIsEditing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
          {state?.message && <p className="text-sm text-danger">{state.message}</p>}
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              status === "COMPLETE" ? "bg-success-bg text-success" : "bg-accent text-accent-foreground"
            }`}
          >
            {status === "COMPLETE" ? "Complete" : "Active"}
          </span>
          <SummaryField label="Job #" value={jobCode ?? NOT_SET} />
          <SummaryField label="Kick-off" value={formatDate(kickOffDate)} />
          <SummaryField label="Target Completion" value={formatDate(targetCompletionDate)} />
          <SummaryField label="PM" value={projectManager?.name ?? NOT_SET} />
        </div>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Edit
        </button>
      </div>
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
