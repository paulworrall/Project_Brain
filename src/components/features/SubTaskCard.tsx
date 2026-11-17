"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { StatusBadge, type StatusBadgeState } from "@/components/ui/StatusBadge";
import type { SubTask, SubTaskStatus } from "@/lib/project/subTasks";

/**
 * FB-012: a numbered, collapsible sub-task card. The header is one button
 * (aria-expanded + aria-controls) showing the number, title, status badge, a
 * one-line summary and "Edit" / "Open". Done tasks are collapsed to that line;
 * the current task opens expanded with a navy left border; later tasks are
 * collapsed and muted, and a blocked task shows its reason and can't be opened.
 * Which cards the user expanded is kept in component state only (this session).
 * A task that becomes current after an action opens by itself, and a change of
 * status is announced politely.
 */

const BADGE_STATE: Record<SubTaskStatus, StatusBadgeState> = {
  not_started: "not_started",
  in_progress: "in_progress",
  done: "done",
  needs_review: "needs_review",
  locked: "locked",
};

const STATUS_WORD: Record<SubTaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  needs_review: "Needs review",
  locked: "Locked",
};

// A group lets one card open another ("Open" on the approval card opens "Build the estimate").
const GroupContext = createContext<{ open: (id: string) => void; register: (id: string, fn: () => void) => () => void } | null>(
  null
);

export function SubTaskGroup({ children }: { children: ReactNode }) {
  // Created once (lazy state), so the context value is stable and no ref is read during render.
  const [value] = useState(() => {
    const openers = new Map<string, () => void>();
    return {
      open: (id: string) => openers.get(id)?.(),
      register: (id: string, fn: () => void) => {
        openers.set(id, fn);
        return () => {
          openers.delete(id);
        };
      },
    };
  });
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useOpenSubTask(): (id: string) => void {
  const group = useContext(GroupContext);
  return (id) => group?.open(id);
}

export function SubTaskCard({
  task,
  readOnly = false,
  children,
}: {
  task: SubTask;
  /** The project is complete: everything is collapsed and read-only (still expandable to read). */
  readOnly?: boolean;
  children?: ReactNode;
}) {
  const bodyId = useId();
  const group = useContext(GroupContext);
  const blocked = task.blocked !== null;
  const [open, setOpen] = useState(task.current && !blocked);
  const [prevCurrent, setPrevCurrent] = useState(task.current);
  const [announcement, setAnnouncement] = useState("");
  const [prevStatus, setPrevStatus] = useState(task.status);

  // A task that becomes current (after an action) opens by itself.
  if (task.current !== prevCurrent) {
    setPrevCurrent(task.current);
    if (task.current && !blocked) setOpen(true);
  }
  if (task.status !== prevStatus) {
    setPrevStatus(task.status);
    setAnnouncement(`${task.title}: ${STATUS_WORD[task.status]}`);
  }

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A link to something inside a collapsed card (#scope-gate, #estimates…) opens it.
    function openForHash() {
      const hash = window.location.hash.slice(1);
      if (hash && !blocked && bodyRef.current?.querySelector(`[id="${hash}"]`)) setOpen(true);
    }
    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, [blocked]);

  useEffect(() => {
    return group?.register(task.id, () => {
      if (!blocked) setOpen(true);
    });
  }, [group, task.id, blocked]);

  const expandable = !blocked && children !== undefined && children !== null;
  const expanded = open && expandable;
  const action = task.status === "done" || task.status === "locked" ? "Edit" : "Open";

  return (
    <div
      role="group"
      aria-labelledby={`${bodyId}-title`}
      data-subtask={task.id}
      data-current={task.current ? "true" : undefined}
      className={`border border-border bg-surface ${
        task.current ? "border-l-4 border-l-navy" : ""
      } ${!task.current && task.status !== "done" ? "bg-surface-muted" : ""}`}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={expandable ? expanded : undefined}
          aria-controls={expandable ? bodyId : undefined}
          aria-disabled={!expandable ? true : undefined}
          onClick={() => expandable && setOpen((value) => !value)}
          className={`group flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left focus-inset ${
            expandable ? "cursor-pointer hover:bg-line-soft" : "cursor-default"
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
              task.current
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong text-foreground"
            }`}
          >
            {task.number}
          </span>
          <span
            id={`${bodyId}-title`}
            className={`text-card font-medium ${blocked ? "text-muted-foreground" : "text-foreground"}`}
          >
            {task.title}
          </span>
          <StatusBadge state={BADGE_STATE[task.status]} />
          {(task.summary || blocked) && (
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {blocked ? task.blocked : task.summary}
            </span>
          )}
          {expandable && !readOnly && (
            <span className="ml-auto text-xs font-medium text-primary underline-offset-4 group-hover:underline">
              {expanded ? "Close" : action}
            </span>
          )}
          {expandable && readOnly && (
            <span className="ml-auto text-xs font-medium text-primary">{expanded ? "Close" : "View"}</span>
          )}
        </button>
      </h3>
      {expandable && (
        <div ref={bodyRef} id={bodyId} hidden={!expanded} className="space-y-4 border-t border-border px-4 py-4">
          {/* A disabled fieldset makes the controls read-only on a complete project; the header stays usable. */}
          <fieldset disabled={readOnly} className="contents">
            {children}
          </fieldset>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * Used inside the panels that hold several sub-tasks: with a derived task it
 * renders the collapsible card; without one (the panel on its own, e.g. in
 * isolation) it renders its content as a plain block, unchanged.
 */
export function SubTaskSection({
  task,
  readOnly,
  className = "",
  children,
}: {
  task?: SubTask;
  readOnly?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return task ? (
    <SubTaskCard task={task} readOnly={readOnly}>
      {children}
    </SubTaskCard>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** "Open …" inside one card that opens and scrolls to another (e.g. approval -> Build the estimate). */
export function OpenSubTaskButton({ targetId, children }: { targetId: string; children: ReactNode }) {
  const open = useOpenSubTask();
  return (
    <button
      type="button"
      onClick={() => {
        open(targetId);
        requestAnimationFrame(() =>
          document
            .querySelector(`[data-subtask="${targetId}"]`)
            ?.scrollIntoView?.({ block: "start", behavior: "auto" })
        );
      }}
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}
