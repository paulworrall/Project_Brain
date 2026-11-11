"use client";

import { useId, useState, useTransition } from "react";
import { updateSpecialistInputAction } from "@/app/(dashboard)/projects/[projectId]/step-actions";
import {
  SPECIALIST_STATUS_LABEL,
  specialistHeader,
  type SpecialistInputStatusName,
  type SpecialistRow,
} from "@/lib/project/readiness";

const STATUSES: SpecialistInputStatusName[] = ["not_requested", "requested", "received"];

/**
 * FB-008 specialist input tracker — replaces the Specialist consultation
 * stage. One row per confirmed capability; the PM sets each row's status by
 * hand and can add a note. Not a gate: nothing waits on it.
 */
function SpecialistRowEditor({
  projectId,
  row,
  readOnly,
}: {
  projectId: string;
  row: SpecialistRow;
  readOnly: boolean;
}) {
  const [status, setStatus] = useState<SpecialistInputStatusName>(row.status);
  const [note, setNote] = useState(row.note ?? "");
  const [savedNote, setSavedNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const statusId = useId();
  const noteId = useId();

  function save(next: { status: SpecialistInputStatusName; note: string }) {
    setError(null);
    startTransition(async () => {
      const result = await updateSpecialistInputAction({
        projectId,
        capability: row.capability,
        status: next.status,
        note: next.note,
      });
      if (result.ok) {
        setSavedNote(next.note);
      } else {
        setError(result.fieldErrors?.note ?? result.message);
        setStatus(row.status);
      }
    });
  }

  return (
    <li className="grid gap-2 border-t border-border py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{row.label}</p>
        <label htmlFor={noteId} className="sr-only">
          Note for {row.label}
        </label>
        <input
          id={noteId}
          type="text"
          value={note}
          readOnly={readOnly}
          placeholder="Optional note (who, when, where it is)…"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (!readOnly && note.trim() !== savedNote.trim()) save({ status, note });
          }}
          className="mt-1 w-full border border-border-strong bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground read-only:border-border read-only:bg-surface-muted"
        />
      </div>
      <div>
        <label htmlFor={statusId} className="sr-only">
          Status for {row.label}
        </label>
        <select
          id={statusId}
          value={status}
          disabled={readOnly || pending}
          onChange={(event) => {
            const next = event.target.value as SpecialistInputStatusName;
            setStatus(next);
            save({ status: next, note });
          }}
          className="min-h-9 w-full border border-border-strong bg-surface px-2 py-1 text-sm text-foreground disabled:border-border disabled:text-muted-foreground"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {SPECIALIST_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {error}
        </p>
      )}
    </li>
  );
}

export function SpecialistInputTracker({
  projectId,
  rows,
  readOnly = false,
}: {
  projectId: string;
  rows: SpecialistRow[];
  readOnly?: boolean;
}) {
  const headingId = useId();
  return (
    <section
      id="specialist-inputs"
      aria-labelledby={headingId}
      className="border border-border bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-base font-medium text-foreground">
          Specialist input
        </h3>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground">{specialistHeader(rows)}</p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm the capabilities this project needs, and a row for each appears here.
        </p>
      ) : (
        <ul className="mt-1">
          {rows.map((row) => (
            <SpecialistRowEditor
              key={`${row.capability}-${row.status}-${row.note ?? ""}`}
              projectId={projectId}
              row={row}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
