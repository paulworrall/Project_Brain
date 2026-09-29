"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  suggestBriefAttributesAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { KeyAttributeRow } from "./KeyAttributeRow";

/**
 * "What We Need to Find Out" — the fixed checklist of details every brief
 * must deliver, derived entirely from getBriefCompleteness (never generated
 * by AI). Required attributes first, in config order; optional ones in a
 * secondary group that never counts against readiness. Confirming or
 * editing an attribute revalidates the page, so the checklist updates
 * straight away with no regeneration.
 */
export function BriefChecklist({
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
  const pendingSuggestions = completeness.attributes.filter((a) => a.suggestion || a.pmSuggestion).length;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">What We Need to Find Out</h3>
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

      <ul className="space-y-3" aria-label="Required details">
        {required.map((attribute) => (
          <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
        ))}
      </ul>

      <div className="border-t border-border pt-3">
        <Disclosure
          summary={`Optional details (${optional.filter((a) => a.status !== "missing").length} of ${optional.length} captured) — never block readiness`}
        >
          <ul className="space-y-3" aria-label="Optional details">
            {optional.map((attribute) => (
              <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}
