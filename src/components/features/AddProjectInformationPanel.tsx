"use client";

import { useId, useRef, useState, useTransition } from "react";
import { SidebarPanel } from "./SidebarPanel";
import { Button } from "@/components/ui/Button";
import { addProjectInformationAction } from "@/app/(dashboard)/projects/[projectId]/actions";
import {
  INFO_ACCEPT_ATTRIBUTE,
  INFO_CATEGORIES,
  validateInfoFileMeta,
  type InfoCategory,
} from "@/lib/projectInfoFileRules";
import { formatUkDateTime } from "@/lib/updateLabel";
import { PROJECT_COMPLETE_MESSAGE } from "@/lib/projectSteps";
import { VersionHistoryDrawer, type VersionView } from "./VersionHistoryDrawer";

/**
 * FB-010: the sidebar panel for adding longer project information — meeting
 * notes, client clarifications, presentations and documents — above the
 * Project assistant. Pasted text or one or more files; each file is saved as
 * its own version, in order (one request each, under the 10 MB server action
 * limit), and the clarification email is redrafted once, after the last.
 * Errors keep what was entered; files already saved leave the list.
 */

type Mode = "paste" | "files";

interface ResultLine {
  kind: "status" | "error";
  text: string;
  /** A saved version's confirmation (shown with a tick). */
  saved?: boolean;
}

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddProjectInformationPanel({
  projectId,
  versions,
  readOnly = false,
}: {
  projectId: string;
  /** The brief and its updates, oldest first; the history drawer shows them newest first. */
  versions: VersionView[];
  /** The project is complete: nothing can be added. */
  readOnly?: boolean;
}) {
  const [category, setCategory] = useState<InfoCategory>("MEETING_NOTES");
  const [source, setSource] = useState<"CLIENT" | "INTERNAL_TEAM">("CLIENT");
  const [occurredOn, setOccurredOn] = useState(today);
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultLine[]>([]);
  const [dragging, setDragging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { category: useId(), source: useId(), date: useId(), text: useId(), files: useId() };
  const latest = versions.at(-1);

  function addFiles(list: FileList | File[]) {
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const error = validateInfoFileMeta({ name: file.name, size: file.size, type: file.type });
      if (error) problems.push(`${file.name}: ${error}`);
      else if (!files.some((f) => f.name === file.name && f.size === file.size))
        accepted.push(file);
    }
    setFiles((current) => [...current, ...accepted]);
    setFileError(problems.length > 0 ? problems.join(" ") : null);
  }

  function baseForm(finalInBatch: boolean): FormData {
    const formData = new FormData();
    formData.set("category", category);
    formData.set("source", source);
    formData.set("occurredOn", occurredOn);
    formData.set("finalInBatch", String(finalInBatch));
    return formData;
  }

  function submit() {
    setResults([]);
    startTransition(async () => {
      const lines: ResultLine[] = [];
      if (mode === "paste") {
        const formData = baseForm(true);
        formData.set("content", text);
        const result = await addProjectInformationAction(projectId, formData);
        if (result.ok) {
          lines.push(
            { kind: "status", text: result.data.confirmation, saved: true },
            { kind: "status", text: result.data.notice }
          );
          setText("");
        } else {
          lines.push({ kind: "error", text: result.message });
        }
        setResults(lines);
        return;
      }
      // Files: one request each, in order. Stop at the first failure so the
      // failed file and those after it stay in the list to try again.
      const remaining = [...files];
      let lastNotice: string | null = null;
      while (remaining.length > 0) {
        const file = remaining[0];
        const formData = baseForm(remaining.length === 1);
        formData.set("file", file);
        const result = await addProjectInformationAction(projectId, formData);
        if (!result.ok) {
          lines.push({ kind: "error", text: `${file.name}: ${result.message}` });
          break;
        }
        lines.push({
          kind: "status",
          text: `${file.name}: ${result.data.confirmation}`,
          saved: true,
        });
        lastNotice = result.data.notice;
        remaining.shift();
      }
      if (lastNotice && remaining.length === 0) lines.push({ kind: "status", text: lastNotice });
      setFiles(remaining);
      setResults(lines);
    });
  }

  const canSubmit =
    !pending && !readOnly && (mode === "paste" ? text.trim().length > 0 : files.length > 0);
  const errors = results.filter((r) => r.kind === "error");
  const statuses = results.filter((r) => r.kind === "status");

  return (
    <SidebarPanel
      headingLevel={2}
      className="p-4"
      icon={
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M6 3.5h8l4 4V20.5H6z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M12 10.5v6M9 13.5h6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      }
      title="Add project information"
      subtitle={
        <>Meeting notes, client clarifications, presentations — anything new about this project.</>
      }
    >
      {readOnly && (
        <p className="mt-3 text-sm text-foreground">
          <span aria-hidden="true">! </span>
          {PROJECT_COMPLETE_MESSAGE}
        </p>
      )}
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <fieldset disabled={readOnly || pending} className="min-w-0 space-y-3">
          <legend className="sr-only">Project information</legend>
          <div>
            <label htmlFor={ids.category} className="block text-xs font-medium text-foreground">
              Type
            </label>
            <select
              id={ids.category}
              value={category}
              onChange={(e) => setCategory(e.target.value as InfoCategory)}
              className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              {INFO_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div role="radiogroup" aria-labelledby={ids.source} className="text-sm text-foreground">
            <span id={ids.source} className="block text-xs font-medium">
              From
            </span>
            <div className="mt-1 flex flex-wrap gap-x-4">
              {(["CLIENT", "INTERNAL_TEAM"] as const).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${ids.source}-source`}
                    checked={source === value}
                    onChange={() => setSource(value)}
                  />
                  {value === "CLIENT" ? "Client" : "Internal team"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={ids.date} className="block text-xs font-medium text-foreground">
              Date it happened (optional)
            </label>
            <input
              id={ids.date}
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Add as"
            className="flex flex-wrap gap-x-4 text-sm text-foreground"
          >
            <label className="flex min-h-11 items-center gap-1.5">
              <input
                type="radio"
                name={`${ids.text}-mode`}
                checked={mode === "paste"}
                onChange={() => setMode("paste")}
              />
              Paste text
            </label>
            <label className="flex min-h-11 items-center gap-1.5">
              <input
                type="radio"
                name={`${ids.text}-mode`}
                checked={mode === "files"}
                onChange={() => setMode("files")}
              />
              Add files
            </label>
          </div>

          {mode === "paste" ? (
            <div>
              <label htmlFor={ids.text} className="sr-only">
                Text to add
              </label>
              <textarea
                id={ids.text}
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste meeting notes, a client's reply or other information…"
                className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          ) : (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!readOnly && !pending) addFiles(e.dataTransfer.files);
                }}
                className={`border border-dashed px-3 py-4 text-center text-sm ${
                  dragging ? "border-navy bg-tint" : "border-border-strong bg-surface"
                }`}
              >
                <p className="text-muted-foreground">Drop files here, or</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 min-h-11"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose files
                </Button>
                <input
                  ref={fileInputRef}
                  id={ids.files}
                  type="file"
                  multiple
                  accept={INFO_ACCEPT_ATTRIBUTE}
                  aria-label="Files to add"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Word, PDF, PowerPoint or text, up to 8 MB each.
                </p>
              </div>
              {files.length > 0 && (
                <ul
                  aria-label="Files to add"
                  className="mt-2 divide-y divide-border border border-border"
                >
                  {files.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center justify-between gap-2 px-2 py-1 text-sm"
                    >
                      <span className="min-w-0 break-words">
                        {file.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({formatFileSize(file.size)})
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setFiles((current) => current.filter((f) => f !== file))}
                        className="min-h-11 shrink-0 px-2 text-xs font-medium text-primary hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {fileError && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {fileError}
                </p>
              )}
            </div>
          )}

          <Button type="submit" disabled={!canSubmit} className="min-h-11 w-full">
            {pending ? "Adding…" : "Add to project"}
          </Button>
        </fieldset>
      </form>

      <div role="status" aria-live="polite" className="mt-2 space-y-1 text-xs text-foreground">
        {statuses.map((line, i) => (
          <p key={i}>
            {line.saved && <span aria-hidden="true">✓ </span>}
            {line.text}
          </p>
        ))}
      </div>
      {errors.length > 0 && (
        <div role="alert" className="mt-1 space-y-1 text-xs text-danger">
          {errors.map((line, i) => (
            <p key={i}>{line.text}</p>
          ))}
        </div>
      )}

      {latest && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Latest:{" "}
          <span className="font-medium text-foreground">
            {latest.versionNumber ? `v${latest.versionNumber}` : "—"}
          </span>{" "}
          · {formatUkDateTime(latest.createdAt)} ·{" "}
          <button
            type="button"
            className="min-h-6 font-medium text-primary hover:underline"
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
