"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  suggestBriefAttributesAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import {
  getBriefAttribute,
  isSubFieldFilled,
  type BriefAttributeValues,
  type BriefSubFieldDefinition,
} from "@/lib/briefAttributes";
import type {
  BriefAttributeCompleteness,
  BriefAttributeStatus,
  BriefCompleteness,
} from "@/lib/briefCompleteness";
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

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

function formatSubField(
  subField: BriefSubFieldDefinition,
  value: BriefAttributeValues[string]
): string {
  if (Array.isArray(value)) {
    return value.map((m) => (m.date ? `${m.name} (${formatDate(m.date)})` : m.name)).join(" · ");
  }
  if (typeof value !== "string") return "";
  return subField.type === "date" ? formatDate(value) : value;
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ValuesList({
  attributeId,
  values,
}: {
  attributeId: string;
  values: BriefAttributeValues;
}) {
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return null;
  const filled = attribute.subFields.filter((f) => isSubFieldFilled(f, values[f.id]));
  if (filled.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {filled.map((subField) => (
        <div key={subField.id} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{subField.label}</dt>
          <dd className="break-words text-foreground">
            {formatSubField(subField, values[subField.id])}
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
  const { confirmed, suggestion, status } = attribute;
  // Remount the editor whenever the stored state changes, so it reopens
  // closed with fresh defaults after a save.
  const editorKey = `${confirmed?.id ?? "none"}-${suggestion?.id ?? "none"}`;

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
      </div>

      {confirmed ? (
        <div className="space-y-1">
          <ValuesList attributeId={attribute.id} values={confirmed.values} />
          <p className="text-xs text-muted-foreground">
            Confirmed {formatTimestamp(confirmed.createdAt)}
            {confirmed.createdByName ? ` by ${confirmed.createdByName}` : ""} · from{" "}
            {SOURCE_LABEL[confirmed.source]}
          </p>
          {attribute.missingSubFields.length > 0 && (
            <p className="text-xs text-warning">
              Still needed: {attribute.missingSubFields.map((f) => f.label).join(", ")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">{attribute.question}</p>
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

      {!suggestion && (
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

/**
 * Phase 1's key details — the required attributes every brief must have
 * before a SOW can be generated, plus optional ones that never block
 * anything. AI-extracted values are shown as suggestions until a PM
 * confirms them. Everything shown comes from getBriefCompleteness.
 */
export function KeyAttributesPanel({
  projectId,
  completeness,
}: {
  projectId: string;
  completeness: BriefCompleteness;
}) {
  const action = suggestBriefAttributesAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  const required = completeness.attributes.filter((a) => a.required);
  const optional = completeness.attributes.filter((a) => !a.required);
  const confirmedCount = required.filter((a) => a.status === "confirmed").length;
  const pendingSuggestions = completeness.attributes.filter((a) => a.suggestion).length;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Key details</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {confirmedCount} of {required.length} required details confirmed
            {pendingSuggestions > 0
              ? ` · ${pendingSuggestions} AI suggestion${pendingSuggestions === 1 ? "" : "s"} to review`
              : ""}
            . All required details must be confirmed before a SOW can be generated.
          </p>
        </div>
        <form action={formAction}>
          <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
            {pending ? "Reading…" : "Suggest from brief & inputs"}
          </Button>
        </form>
      </div>
      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}

      <ul className="space-y-3">
        {required.map((attribute) => (
          <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
        ))}
      </ul>

      <div className="border-t border-border pt-3">
        <Disclosure
          summary={`Optional details (${optional.filter((a) => a.status !== "missing").length} of ${optional.length} captured)`}
        >
          <ul className="space-y-3">
            {optional.map((attribute) => (
              <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}
