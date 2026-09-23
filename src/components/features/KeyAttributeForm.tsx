"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  confirmBriefAttributeAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import {
  getBriefAttribute,
  type BriefAttributeValues,
  type BriefMilestone,
  type BriefSubFieldDefinition,
} from "@/lib/briefAttributes";

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring";

function MilestonesEditor({
  inputId,
  name,
  initial,
}: {
  inputId: string;
  name: string;
  initial: BriefMilestone[];
}) {
  const [milestones, setMilestones] = useState<BriefMilestone[]>(initial);

  function update(index: number, patch: Partial<BriefMilestone>) {
    setMilestones((current) => current.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  return (
    <div className="mt-1 space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(milestones)} />
      {milestones.map((milestone, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            id={index === 0 ? inputId : undefined}
            aria-label={`Milestone ${index + 1} name`}
            value={milestone.name}
            onChange={(e) => update(index, { name: e.target.value })}
            placeholder="e.g. Beta launch"
            className={`${INPUT_CLASS} mt-0 min-w-0 flex-1`}
          />
          <input
            type="date"
            aria-label={`Milestone ${index + 1} date`}
            value={milestone.date ?? ""}
            onChange={(e) => update(index, { date: e.target.value || null })}
            className={`${INPUT_CLASS} mt-0 w-auto`}
          />
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs"
            aria-label={`Remove milestone ${index + 1}`}
            onClick={() => setMilestones((current) => current.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="px-2 py-1 text-xs"
        onClick={() => setMilestones((current) => [...current, { name: "", date: null }])}
      >
        + Add milestone
      </Button>
    </div>
  );
}

function SubFieldInput({
  idPrefix,
  attributeId,
  subField,
  value,
}: {
  idPrefix: string;
  attributeId: string;
  subField: BriefSubFieldDefinition;
  value: BriefAttributeValues[string];
}) {
  const inputId = `${idPrefix}-${attributeId}-${subField.id}`;
  const text = typeof value === "string" ? value : "";

  let control;
  switch (subField.type) {
    case "milestones":
      control = (
        <MilestonesEditor
          inputId={inputId}
          name={subField.id}
          initial={Array.isArray(value) ? value : []}
        />
      );
      break;
    case "longText":
      control = (
        <textarea
          id={inputId}
          name={subField.id}
          defaultValue={text}
          rows={2}
          className={INPUT_CLASS}
        />
      );
      break;
    case "date":
      control = (
        <input
          id={inputId}
          name={subField.id}
          type="date"
          defaultValue={text}
          className={INPUT_CLASS}
        />
      );
      break;
    case "email":
      control = (
        <input
          id={inputId}
          name={subField.id}
          type="email"
          defaultValue={text}
          className={INPUT_CLASS}
        />
      );
      break;
    case "currency":
      control = (
        <input
          id={inputId}
          name={subField.id}
          defaultValue={text}
          maxLength={3}
          placeholder="GBP"
          className={`${INPUT_CLASS} w-24 uppercase`}
        />
      );
      break;
    default:
      control = (
        <input id={inputId} name={subField.id} defaultValue={text} className={INPUT_CLASS} />
      );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
        {subField.label}
        {subField.required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </label>
      {control}
      {subField.hint && <p className="mt-0.5 text-xs text-muted-foreground">{subField.hint}</p>}
    </div>
  );
}

/**
 * The PM's form for one key attribute — the only way an attribute becomes
 * confirmed. Inputs come from the attribute's sub-fields in
 * src/lib/briefAttributes.ts. Prefilled from an AI suggestion (passing its
 * id, so accepting it unchanged keeps its source) or the confirmed values.
 */
export function KeyAttributeForm({
  projectId,
  attributeId,
  initialValues,
  suggestionId,
  submitLabel = "Confirm",
  idPrefix = "brief",
}: {
  projectId: string;
  attributeId: string;
  initialValues: BriefAttributeValues;
  suggestionId?: string | null;
  submitLabel?: string;
  /** Keeps input ids unique when the same attribute's form appears twice on a page. */
  idPrefix?: string;
}) {
  const action = confirmBriefAttributeAction.bind(null, projectId, attributeId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );
  const attribute = getBriefAttribute(attributeId);
  if (!attribute) return null;

  return (
    <form action={formAction} className="space-y-3">
      {suggestionId && <input type="hidden" name="suggestionId" value={suggestionId} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {attribute.subFields.map((subField) => (
          <div
            key={subField.id}
            className={
              subField.type === "longText" || subField.type === "milestones" ? "sm:col-span-2" : ""
            }
          >
            <SubFieldInput
              idPrefix={idPrefix}
              attributeId={attribute.id}
              subField={subField}
              value={initialValues[subField.id] ?? null}
            />
          </div>
        ))}
      </div>
      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" className="text-xs" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
