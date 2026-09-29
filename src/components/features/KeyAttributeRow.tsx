"use client";

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
} from "@/lib/briefAttributeDisplay";
import type { BriefAttributeCompleteness, BriefAttributeStatus } from "@/lib/briefCompleteness";
import type { BriefAttributeSource } from "@/generated/prisma/enums";
import { KeyAttributeForm } from "./KeyAttributeForm";

// Icon + text together carry the state — never colour alone.
export const STATUS_ICON: Record<BriefAttributeStatus, string> = {
  confirmed: "✓",
  partial: "◐",
  missing: "○",
};
export const STATUS_LABEL: Record<BriefAttributeStatus, string> = {
  confirmed: "Confirmed",
  partial: "Partial",
  missing: "Missing",
};
export const STATUS_TEXT_CLASS: Record<BriefAttributeStatus, string> = {
  confirmed: "text-success",
  partial: "text-warning",
  missing: "text-muted-foreground",
};

const SOURCE_LABEL: Record<BriefAttributeSource, string> = {
  BRIEF: "the brief",
  UPDATE: "an update",
  CLARIFICATION_ANSWER: "a clarification answer",
  PM_ENTRY: "PM entry",
};

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

/**
 * An attribute's values. For confirmed values every sub-field is shown, so a
 * gap (no end date, no milestones yet) is stated rather than left blank; a
 * suggestion shows only what was actually read.
 */
function ValuesList({
  attributeId,
  values,
  showUnfilled = false,
}: {
  attributeId: string;
  values: BriefAttributeValues;
  showUnfilled?: boolean;
}) {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return null;
  const shown = showUnfilled
    ? attribute.subFields
    : attribute.subFields.filter((f) => isSubFieldFilled(f, values[f.id]));
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {shown.map((subField) => (
        <div
          key={subField.id}
          className={`min-w-0 ${subField.type === "milestones" ? "sm:col-span-2" : ""}`}
        >
          <dt className="text-xs text-muted-foreground">{subField.label}</dt>
          <dd className="break-words text-foreground">
            <SubFieldValue subField={subField} value={values[subField.id]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyAttributeRow({
  projectId,
  attribute,
  idPrefix = "brief",
}: {
  projectId: string;
  attribute: BriefAttributeCompleteness;
  idPrefix?: string;
}) {
  const { confirmed, suggestion, pmSuggestion, status } = attribute;
  // Remount the editor whenever the stored state changes, so it reopens
  // closed with fresh defaults after a save.
  const editorKey = `${confirmed?.id ?? "none"}-${suggestion?.id ?? "none"}-${pmSuggestion?.id ?? "none"}`;

  return (
    <li
      id={`${idPrefix}-attribute-${attribute.id}`}
      className="scroll-mt-24 space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className={`text-sm ${STATUS_TEXT_CLASS[status]}`}>
          {STATUS_ICON[status]}
        </span>
        <h4 className="text-sm font-semibold text-foreground">{attribute.label}</h4>
        <span className={`text-xs font-semibold ${STATUS_TEXT_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {attribute.required && <span className="text-xs text-muted-foreground">· Required</span>}
        {(suggestion || pmSuggestion) && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground">
            Suggestion to review
          </span>
        )}
      </div>

      {confirmed ? (
        <div className="space-y-1">
          <ValuesList attributeId={attribute.id} values={confirmed.values} showUnfilled />
          <p className="text-xs text-muted-foreground">
            Confirmed {formatTimestamp(confirmed.createdAt)}
            {confirmed.createdByName ? ` by ${confirmed.createdByName}` : ""} · from{" "}
            {SOURCE_LABEL[confirmed.source]}
          </p>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">{attribute.question}</p>
      )}

      {status === "partial" && attribute.missingSubFields.length > 0 && (
        <p className="text-xs text-warning">
          Still needed: {attribute.missingSubFields.map((f) => f.label).join(", ")}
        </p>
      )}

      {suggestion && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-surface-muted p-3">
          <p className="text-xs font-semibold text-foreground">
            AI suggestion from {SOURCE_LABEL[suggestion.source]} — not confirmed
          </p>
          <ValuesList attributeId={attribute.id} values={suggestion.values} />
          {suggestion.evidence && (
            <p className="text-xs italic text-muted-foreground">
              &ldquo;{suggestion.evidence}&rdquo;
            </p>
          )}
          <Disclosure key={`suggestion-${editorKey}`} summary="Review and confirm →">
            <KeyAttributeForm
              projectId={projectId}
              attributeId={attribute.id}
              initialValues={suggestion.values}
              suggestionId={suggestion.id}
              idPrefix={idPrefix}
            />
          </Disclosure>
        </div>
      )}

      {pmSuggestion && (
        <div className="space-y-2 rounded-md border border-dashed border-accent-foreground/40 bg-accent p-3">
          <p className="text-xs font-semibold text-accent-foreground">
            Suggested from your PM perspective — not from the client, not confirmed
          </p>
          <ValuesList attributeId={attribute.id} values={pmSuggestion.values} />
          <Disclosure key={`pm-suggestion-${editorKey}`} summary="Review and confirm →">
            <KeyAttributeForm
              projectId={projectId}
              attributeId={attribute.id}
              initialValues={pmSuggestion.values}
              suggestionId={pmSuggestion.id}
              idPrefix={`${idPrefix}-pm`}
            />
          </Disclosure>
        </div>
      )}

      {!suggestion && !pmSuggestion && (
        <Disclosure key={`edit-${editorKey}`} summary={confirmed ? "Edit" : "Fill in →"}>
          <KeyAttributeForm
            projectId={projectId}
            attributeId={attribute.id}
            initialValues={confirmed?.values ?? {}}
            submitLabel={confirmed ? "Save" : "Confirm"}
            idPrefix={idPrefix}
          />
        </Disclosure>
      )}
    </li>
  );
}
