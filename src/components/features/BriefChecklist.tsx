"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  rereadBriefAttributesAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";
import type { BriefCompleteness } from "@/lib/briefCompleteness";
import { KeyAttributeRow } from "./KeyAttributeRow";

/**
 * "What We Need to Find Out" — the fixed checklist of details every brief
 * must deliver, derived entirely from getBriefCompleteness (never generated
 * by AI). Required attributes first, in config order; optional ones in a
 * secondary group that never counts against readiness. What the agent
 * captures counts straight away; a PM's inline Update revalidates the page,
 * so the checklist changes immediately with no regeneration.
 */
export function BriefChecklist({
  projectId,
  completeness,
}: {
  projectId: string;
  completeness: BriefCompleteness;
}) {
  const action = rereadBriefAttributesAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    action,
    undefined
  );

  const required = completeness.attributes.filter((a) => a.required);
  const optional = completeness.attributes.filter((a) => !a.required);
  const capturedCount = required.filter((a) => a.status === "confirmed").length;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">What We Need to Find Out</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {capturedCount} of {required.length} required details captured
          </p>
        </div>
        <form action={formAction}>
          <Button
            type="submit"
            variant="ghost"
            className="px-2 py-1 text-xs"
            disabled={pending}
            title="Fills in anything still missing from the brief and inputs — never overwrites what's there"
          >
            {pending ? "Reading…" : "Re-read brief & inputs"}
          </Button>
        </form>
      </div>
      {state?.message && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}

      <ul aria-label="Required details">
        {required.map((attribute) => (
          <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
        ))}
      </ul>

      <div className="border-t border-border pt-3">
        <Disclosure
          summary={`Optional details (${optional.filter((a) => a.status !== "missing").length} of ${optional.length} captured) — never block readiness`}
        >
          <ul aria-label="Optional details">
            {optional.map((attribute) => (
              <KeyAttributeRow key={attribute.id} projectId={projectId} attribute={attribute} />
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}
