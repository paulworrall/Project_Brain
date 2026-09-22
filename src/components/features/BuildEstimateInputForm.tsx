"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MAP_CAPABILITIES, capabilityLabel } from "@/lib/mapCapabilities";
import {
  addOrReviseCapabilityInputAction,
  type ActionState,
} from "@/app/(dashboard)/projects/[projectId]/estimates/actions";
import type { Capability } from "@/generated/prisma/enums";

type InputMode = "paste" | "upload";

export interface EstimateCapabilityInputView {
  capability: Capability | null;
  otherLabel: string | null;
  rawContent: string;
  sourceFileName: string | null;
}

/**
 * Captures one capability team's raw estimate input per project, inside a
 * modal — a PM may have several teams' estimates to add in one sitting, so
 * picking a capability (via a lozenge grid, not a dropdown) and submitting
 * its content resets back to the grid rather than closing the modal, ready
 * for the next team. Adding a new capability and revising an
 * already-captured one are the same flow: picking an already-captured
 * lozenge prefills its existing content and makes clear that submitting
 * replaces it, matching addOrReviseCapabilityInputAction's
 * upsert-by-capability behavior.
 */
export function BuildEstimateInputForm({
  estimateId,
  existingInputs,
}: {
  estimateId: string;
  existingInputs: EstimateCapabilityInputView[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [capability, setCapability] = useState("");
  const [mode, setMode] = useState<InputMode>("paste");

  const existingByKey = new Map(existingInputs.map((input) => [input.capability ?? "OTHER", input]));
  const existingForSelected = capability ? existingByKey.get(capability) : undefined;

  // Same reasoning as CapabilitiesAndEstimateBriefPanel's suggestAction /
  // EstimateBuildWorkspace's analyzeAction: reset the selection here, inside
  // the action's own async function once a submission actually succeeds —
  // not in a useEffect watching a pending->settled transition
  // (react-hooks/set-state-in-effect). Deliberately does not close the
  // modal, so the next capability can be added straight away.
  async function submitAction(
    prevState: ActionState | undefined,
    formData: FormData
  ): Promise<ActionState | undefined> {
    const result = await addOrReviseCapabilityInputAction(estimateId, prevState, formData);
    if (!result?.message) {
      setCapability("");
      setMode("paste");
    }
    return result;
  }

  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    submitAction,
    undefined
  );

  function closeModal() {
    setIsOpen(false);
    setCapability("");
    setMode("paste");
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Upload the team estimates</h3>
      <p className="text-sm text-muted-foreground">
        Upload or paste the estimate you&apos;ve received back from each capability team.
      </p>

      <Button type="button" variant="secondary" className="text-xs" onClick={() => setIsOpen(true)}>
        + Add estimate input
      </Button>

      {existingInputs.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3 text-xs text-foreground">
          {existingInputs.map((input) => (
            <li key={input.capability ?? "OTHER"}>
              {input.capability ? capabilityLabel(input.capability) : input.otherLabel}
              {input.sourceFileName && (
                <span className="text-muted-foreground"> ({input.sourceFileName})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={isOpen} title="Upload the team estimates" onClose={closeModal}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pick a capability team below, then paste or upload the estimate you&apos;ve received back
            from them. Add as many teams as you have — one at a time — before closing.
          </p>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Capability team
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MAP_CAPABILITIES.map((c) => {
                const isSelected = capability === c.id;
                const isCaptured = existingByKey.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCapability(c.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-surface-muted"
                    }`}
                  >
                    {c.label}
                    {isCaptured && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCapability("OTHER")}
                className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  capability === "OTHER"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-surface-muted"
                }`}
              >
                Other
                {existingByKey.has("OTHER") && <span aria-hidden="true">✓</span>}
              </button>
            </div>
          </div>

          {capability && (
            <form action={formAction} className="space-y-3 border-t border-border pt-4">
              <input type="hidden" name="capability" value={capability} />

              {existingForSelected && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground" role="status">
                  This capability already has input captured — submitting below replaces it.
                </p>
              )}

              {capability === "OTHER" && (
                <div>
                  <label
                    htmlFor="estimate-other-label"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Name the capability team
                  </label>
                  <input
                    id="estimate-other-label"
                    name="otherLabel"
                    defaultValue={existingForSelected?.otherLabel ?? ""}
                    placeholder="e.g. Legal & Compliance"
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                  />
                </div>
              )}

              <div className="flex gap-4 text-xs text-foreground">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="estimate-mode"
                    checked={mode === "paste"}
                    onChange={() => setMode("paste")}
                  />
                  Paste estimate
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="estimate-mode"
                    checked={mode === "upload"}
                    onChange={() => setMode("upload")}
                  />
                  Upload file
                </label>
              </div>

              {mode === "paste" ? (
                <textarea
                  key={`content-${capability}`}
                  name="content"
                  aria-label="Estimate"
                  rows={6}
                  defaultValue={existingForSelected?.rawContent ?? ""}
                  placeholder="Paste the estimate content here…"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                />
              ) : (
                <input
                  name="file"
                  type="file"
                  aria-label="Estimate file"
                  accept=".docx,.pdf,.pptx,.xlsx,.txt"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              )}

              {state?.message && (
                <p className="text-sm text-danger" role="alert">
                  {state.message}
                </p>
              )}

              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Saving…" : existingForSelected ? "Update estimate input" : "Add estimate input"}
              </Button>
            </form>
          )}

          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" variant="ghost" className="text-xs" onClick={closeModal}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
