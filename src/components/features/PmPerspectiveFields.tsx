import {
  PM_PERSPECTIVE_FIELDS,
  PM_PERSPECTIVE_INPUT_PREFIX,
  type PmPerspectiveValues,
} from "@/lib/pmPerspective";

/**
 * The "PM perspective" section of the New Project form — the PM's own
 * thinking, visually and structurally separate from the client brief above
 * it. Every field is optional; intake never waits on it. Controlled, like
 * the brief textarea, so a failed submission (and its retry) doesn't wipe
 * what the PM wrote — React resets uncontrolled fields after a form action.
 */
export function PmPerspectiveFields({
  values,
  onChange,
}: {
  values: PmPerspectiveValues;
  onChange: (fieldId: string, value: string) => void;
}) {
  return (
    // A labelled group rather than <fieldset>/<legend>: a legend sits on the
    // border, and the title should line up inside the box with the fields.
    <div
      role="group"
      aria-labelledby="pm-perspective-title"
      aria-describedby="pm-perspective-intro"
      className="space-y-3 rounded-md border border-accent-foreground/30 bg-accent p-4"
    >
      <h3 id="pm-perspective-title" className="text-sm font-semibold text-accent-foreground">
        PM perspective <span className="font-normal">(optional)</span>
      </h3>
      <p id="pm-perspective-intro" className="text-xs text-muted-foreground">
        Your own view, kept separate from the client&apos;s brief. Everything here is optional — a
        few lines now help the agents ask better questions, and you can add or change it later.
      </p>
      {PM_PERSPECTIVE_FIELDS.map((field) => {
        const inputId = `pm-perspective-${field.id}`;
        return (
          <div key={field.id}>
            <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
              {field.label}
            </label>
            <textarea
              id={inputId}
              name={`${PM_PERSPECTIVE_INPUT_PREFIX}${field.id}`}
              rows={2}
              value={values[field.id] ?? ""}
              onChange={(e) => onChange(field.id, e.target.value)}
              aria-describedby={`${inputId}-helper`}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            />
            <p id={`${inputId}-helper`} className="mt-0.5 text-xs text-muted-foreground">
              {field.helper}
            </p>
          </div>
        );
      })}
    </div>
  );
}
