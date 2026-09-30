"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeValues,
  type BriefSubFieldDefinition,
} from "@/lib/briefAttributes";
import {
  formatBriefDate,
  formatMilestone,
  NO_MILESTONES_TEXT,
  NOT_CONFIRMED_TEXT,
  summarizeValues,
} from "@/lib/briefAttributeDisplay";
import type {
  BriefAttributeCompleteness,
  BriefAttributeOrigin,
  BriefAttributeStatus,
} from "@/lib/briefCompleteness";
import { KeyAttributeForm } from "./KeyAttributeForm";

// Icon + text together carry the state — never colour alone.
export const STATUS_ICON: Record<BriefAttributeStatus, string> = {
  confirmed: "✓",
  partial: "◐",
  missing: "○",
};
export const STATUS_LABEL: Record<BriefAttributeStatus, string> = {
  confirmed: "Captured",
  partial: "Partial",
  missing: "Missing",
};
export const STATUS_TEXT_CLASS: Record<BriefAttributeStatus, string> = {
  confirmed: "text-success",
  partial: "text-warning",
  missing: "text-muted-foreground",
};

export function sourceTagText(origin: BriefAttributeOrigin): string {
  switch (origin.kind) {
    case "brief":
      return "From brief";
    case "update":
      return `${origin.number ? `From update v${origin.number}` : "From an update"}${origin.internalTeam ? " (Internal team)" : ""}`;
    case "pm":
      return "Edited by PM";
  }
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SubFieldValue({
  subField,
  value,
}: {
  subField: BriefSubFieldDefinition;
  value: BriefAttributeValues[string];
}) {
  if (!isSubFieldFilled(subField, value)) {
    return (
      <span className="italic text-muted-foreground">
        {subField.type === "milestones" ? NO_MILESTONES_TEXT : NOT_CONFIRMED_TEXT}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-inside list-disc space-y-0.5">
        {value.map((milestone, i) => (
          <li key={i}>{formatMilestone(milestone)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value !== "string") return null;
  return <>{subField.type === "date" ? formatBriefDate(value) : value}</>;
}

/** Every sub-field of the current value, so a gap (no end date, no milestones yet) is stated, not blank. */
function ValuesList({ attributeId, values }: { attributeId: string; values: BriefAttributeValues }) {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {attribute.subFields.map((subField) => (
        <div
          key={subField.id}
          className={`min-w-0 ${
            subField.type === "milestones" || subField.type === "longText" ? "sm:col-span-2" : ""
          }`}
        >
          <dt className="text-xs text-muted-foreground">{subField.label}</dt>
          <dd className="whitespace-pre-wrap break-words text-foreground">
            <SubFieldValue subField={subField} value={values[subField.id]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One key detail, summary first: status, label, where the value came from
 * and a one-line value, with an inline Update (or Add, when missing). What
 * the agent captured is trusted as-is — there's nothing to approve. The full
 * value and the passage it was read from sit behind "Show more".
 */
export function KeyAttributeRow({
  projectId,
  attribute,
  idPrefix = "brief",
}: {
  projectId: string;
  attribute: BriefAttributeCompleteness;
  idPrefix?: string;
}) {
  const { current, status } = attribute;
  const [editing, setEditing] = useState(false);
  const hasValue = !!current && status !== "missing";
  const summary = current ? summarizeValues(attribute.id, current.values) : "";

  return (
    <li
      id={`${idPrefix}-attribute-${attribute.id}`}
      className="scroll-mt-24 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden="true" className={`text-sm ${STATUS_TEXT_CLASS[status]}`}>
              {STATUS_ICON[status]}
            </span>
            <h4 className="text-sm font-semibold text-foreground">{attribute.label}</h4>
            <span className={`text-xs font-medium ${STATUS_TEXT_CLASS[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            {hasValue && current && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                {sourceTagText(current.origin)}
              </span>
            )}
          </div>
          {hasValue ? (
            <p className="mt-0.5 truncate text-sm text-foreground" title={summary}>
              {summary}
            </p>
          ) : (
            !editing && <p className="mt-0.5 text-xs text-muted-foreground">{attribute.question}</p>
          )}
          {status === "partial" && attribute.missingSubFields.length > 0 && (
            <p className="mt-0.5 text-xs text-warning">
              Still needed: {attribute.missingSubFields.map((f) => f.label).join(", ")}
            </p>
          )}
        </div>
        {!editing && (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 px-2.5 py-1 text-xs"
            aria-label={`${hasValue ? "Update" : "Add"} ${attribute.label}`}
            onClick={() => setEditing(true)}
          >
            {hasValue ? "Update" : "Add"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 rounded-md border border-border bg-surface-muted p-3">
          <KeyAttributeForm
            projectId={projectId}
            attributeId={attribute.id}
            initialValues={hasValue && current ? current.values : {}}
            onDone={() => setEditing(false)}
            idPrefix={idPrefix}
          />
        </div>
      ) : (
        hasValue &&
        current && (
          <Disclosure className="mt-1" summary={<span className="text-xs">Show more</span>}>
            <div className="space-y-2 rounded-md bg-surface-muted p-3">
              <ValuesList attributeId={attribute.id} values={current.values} />
              {current.evidence && (
                <p className="text-xs italic text-muted-foreground">&ldquo;{current.evidence}&rdquo;</p>
              )}
              <p className="text-xs text-muted-foreground">
                {current.origin.kind === "pm"
                  ? `Edited${current.createdByName ? ` by ${current.createdByName}` : ""} · ${formatTimestamp(current.createdAt)}`
                  : `${sourceTagText(current.origin)} · captured ${formatTimestamp(current.createdAt)}`}
              </p>
            </div>
          </Disclosure>
        )
      )}
    </li>
  );
}
