"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { SidebarPanel } from "./SidebarPanel";
import { Button } from "@/components/ui/Button";
import {
  sendAssistantMessageAction,
  type AssistantReply,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import { formatUkDateTime } from "@/lib/updateLabel";
import { VersionHistoryDrawer, type VersionView } from "./VersionHistoryDrawer";

/**
 * The Project assistant (FB-008): one input for questions and updates —
 * merges Ask me anything and Keep This Project Up to Date. Each message is
 * classified on the server, then answered and/or recorded as an update. If
 * the classifier can't tell, the assistant asks which was meant, with two
 * buttons. The only panel in the project sidebar.
 */

type Entry =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "answer"; text: string }
  | { id: number; kind: "confirmation"; text: string; notice?: string }
  | { id: number; kind: "declined"; text: string }
  | { id: number; kind: "error"; text: string }
  | { id: number; kind: "choose"; resolved: boolean };

/** An entry before it gets its id (Omit distributed over the union). */
type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

interface PendingChoice {
  message: string;
  source: string;
}

export function ProjectAssistant({
  projectId,
  projectName,
  versions,
}: {
  projectId: string;
  projectName: string;
  /** The brief and its updates, oldest first; the history drawer shows them newest first. */
  versions: VersionView[];
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("CLIENT");
  const [choice, setChoice] = useState<PendingChoice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const nextId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const choiceRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  const sourceLabelId = useId();
  const latest = versions.at(-1);

  useEffect(() => {
    // The "which did you mean?" buttons take focus when they appear.
    if (choice) choiceRef.current?.focus();
  }, [choice]);

  function add(...items: NewEntry[]) {
    setEntries((prev) => [
      ...prev,
      ...items.map((item) => ({ ...item, id: nextId.current++ }) as Entry),
    ]);
  }

  function showReply(reply: AssistantReply, sent: PendingChoice) {
    if (reply.kind === "choose") {
      setChoice(sent);
      add({ kind: "choose", resolved: false });
      return;
    }
    const items: NewEntry[] = [];
    if (reply.confirmation)
      items.push({ kind: "confirmation", text: reply.confirmation, notice: reply.notice });
    if (reply.declined) items.push({ kind: "declined", text: reply.declined });
    if (reply.answer) items.push({ kind: "answer", text: reply.answer });
    add(...items);
  }

  function send(formData: FormData, sent: PendingChoice) {
    startTransition(async () => {
      try {
        const result = await sendAssistantMessageAction(projectId, formData);
        if (result.ok) showReply(result.data, sent);
        else add({ kind: "error", text: result.message });
      } catch {
        add({ kind: "error", text: "Something went wrong. Please try again." });
      }
    });
  }

  function submit() {
    const file = fileRef.current?.files?.[0];
    const text = message.trim();
    if (!text && !file) return;
    const formData = new FormData();
    formData.set("message", text);
    formData.set("source", source);
    formData.set("mode", "auto");
    if (file) formData.set("file", file);
    add({ kind: "user", text: file ? `${text ? `${text} ` : ""}(attached ${file.name})` : text });
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    setChoice(null);
    send(formData, { message: text, source });
  }

  function choose(mode: "question" | "update") {
    if (!choice) return;
    const formData = new FormData();
    formData.set("message", choice.message);
    formData.set("source", choice.source);
    formData.set("mode", mode);
    setEntries((prev) => prev.map((e) => (e.kind === "choose" ? { ...e, resolved: true } : e)));
    add({ kind: "user", text: mode === "question" ? "It's a question." : "It's an update." });
    const sent = choice;
    setChoice(null);
    send(formData, sent);
  }

  return (
    <SidebarPanel
      headingLevel={2}
      className="flex h-full flex-col p-4"
      icon={
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5v-7Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="9.25" r="0.9" fill="currentColor" />
          <circle cx="12" cy="9.25" r="0.9" fill="currentColor" />
          <circle cx="15" cy="9.25" r="0.9" fill="currentColor" />
        </svg>
      }
      title="Project assistant"
      subtitle={<>For {projectName}</>}
    >
      <div
        role="log"
        aria-live="polite"
        aria-label="Project assistant conversation"
        className="mt-4 max-h-[50vh] flex-1 space-y-3 overflow-y-auto bg-surface-muted p-3 text-sm"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground">
            Ask about this project, or tell me something new — a client reply, meeting notes, a
            changed budget — and I&apos;ll update the project. Answers come only from this
            project&apos;s own records.
          </p>
        ) : (
          entries.map((entry) => {
            switch (entry.kind) {
              case "user":
                return (
                  <p
                    key={entry.id}
                    className="bg-navy px-3 py-2 font-medium whitespace-pre-wrap text-white"
                  >
                    <span className="sr-only">You: </span>
                    {entry.text}
                  </p>
                );
              case "answer":
                return (
                  <p
                    key={entry.id}
                    className="whitespace-pre-wrap border border-border bg-surface px-3 py-2 text-foreground"
                  >
                    {entry.text}
                  </p>
                );
              case "confirmation":
                return (
                  <div
                    key={entry.id}
                    className="border border-border bg-surface px-3 py-2 text-foreground"
                  >
                    <p className="flex items-start gap-1.5 font-medium">
                      <span aria-hidden="true">✓</span>
                      {entry.text}
                    </p>
                    {entry.notice && (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.notice}</p>
                    )}
                  </div>
                );
              case "declined":
                return (
                  <p
                    key={entry.id}
                    className="border border-border bg-surface px-3 py-2 text-foreground"
                  >
                    <span aria-hidden="true">! </span>
                    {entry.text}
                  </p>
                );
              case "error":
                return (
                  <p
                    key={entry.id}
                    role="alert"
                    className="border border-danger bg-surface px-3 py-2 text-danger"
                  >
                    <span aria-hidden="true">⚠ </span>
                    {entry.text}
                  </p>
                );
              case "choose":
                return (
                  <div
                    key={entry.id}
                    className="border border-border bg-surface px-3 py-2 text-foreground"
                  >
                    <p>Is that a question, or an update to record on the project?</p>
                    {!entry.resolved && choice && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          ref={choiceRef}
                          type="button"
                          onClick={() => choose("question")}
                          className="min-h-11 border border-primary bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-line-soft"
                        >
                          A question
                        </button>
                        <button
                          type="button"
                          onClick={() => choose("update")}
                          className="min-h-11 border border-primary bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-line-soft"
                        >
                          An update
                        </button>
                      </div>
                    )}
                  </div>
                );
            }
          })
        )}
        {pending && <p className="text-muted-foreground">Working on it…</p>}
      </div>

      <form
        className="mt-4 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={messageId} className="sr-only">
          Message
        </label>
        <textarea
          id={messageId}
          rows={3}
          value={message}
          disabled={pending}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask a question, or tell me something new about this project"
          className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
          <div
            role="radiogroup"
            aria-labelledby={sourceLabelId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span id={sourceLabelId} className="font-medium">
              Updates from
            </span>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="source"
                value="CLIENT"
                checked={source === "CLIENT"}
                onChange={() => setSource("CLIENT")}
              />
              Client
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="source"
                value="INTERNAL_TEAM"
                checked={source === "INTERNAL_TEAM"}
                onChange={() => setSource("INTERNAL_TEAM")}
              />
              Internal team
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">
            Or attach a file (recorded as an update)
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".docx,.pdf,.pptx,.txt"
              disabled={pending}
              className="mt-1 block w-full text-xs text-foreground"
            />
          </label>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Working…" : "Send"}
        </Button>
      </form>

      {latest && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Latest:{" "}
          <span className="font-medium text-foreground">
            {latest.versionNumber ? `v${latest.versionNumber}` : "—"}
          </span>{" "}
          · {formatUkDateTime(latest.createdAt)} ·{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            aria-haspopup="dialog"
            onClick={() => setHistoryOpen(true)}
          >
            View history ({versions.length})
          </button>
        </p>
      )}
      <VersionHistoryDrawer
        versions={versions}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </SidebarPanel>
  );
}
