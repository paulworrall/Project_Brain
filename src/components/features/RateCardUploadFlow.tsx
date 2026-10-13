"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  RATE_CARD_ACCEPT_ATTRIBUTE,
  RATE_CARD_TEMPLATE_URL,
  validateRateCardFileMeta,
} from "@/lib/rateCardTemplate";
import { capabilityLabel } from "@/lib/mapCapabilities";
import {
  createRateCardAction,
  previewRateCardUploadAction,
  uploadRateCardVersionAction,
  type RateCardPreviewResult,
} from "@/app/(dashboard)/clients/[clientId]/actions";

const PREVIEW_ROW_LIMIT = 200;

type Step =
  | { kind: "choose" }
  | { kind: "checking" }
  | { kind: "errors"; errors: string[] }
  | { kind: "preview"; preview: Extract<RateCardPreviewResult, { ok: true }> }
  | { kind: "saving"; preview: Extract<RateCardPreviewResult, { ok: true }> };

/**
 * Admin rate card upload: download the template, choose the filled-in .xlsx,
 * check it (parse + validate every row, nothing saved), review the parsed
 * lines and currency summary, then confirm to create the version. With a
 * rateCardId it adds a version to that card; without one it creates a new
 * named rate card. A new version is never made the default here — promotion
 * stays the separate "Set as current version" action.
 */
export function RateCardUploadFlow({
  clientId,
  rateCardId,
  onDone,
}: {
  clientId: string;
  rateCardId?: string;
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const fileId = useId();
  const nameId = useId();

  function buildFormData(): FormData {
    const formData = new FormData();
    if (!rateCardId) formData.set("name", name);
    if (file) formData.set("file", file);
    return formData;
  }

  async function handleCheck() {
    setSaveError(null);
    if (!file) {
      setStep({ kind: "errors", errors: ["Choose the filled-in rate card file (.xlsx)."] });
      return;
    }
    const metaError = validateRateCardFileMeta({ name: file.name, size: file.size, type: file.type });
    if (metaError) {
      setStep({ kind: "errors", errors: [metaError] });
      return;
    }
    setStep({ kind: "checking" });
    try {
      const result = await previewRateCardUploadAction(buildFormData());
      setStep(result.ok ? { kind: "preview", preview: result } : { kind: "errors", errors: result.errors });
    } catch {
      setStep({ kind: "errors", errors: ["We couldn't check this file. Try again."] });
    }
  }

  async function handleConfirm(preview: Extract<RateCardPreviewResult, { ok: true }>) {
    setStep({ kind: "saving", preview });
    try {
      const formData = buildFormData();
      const result = rateCardId
        ? await uploadRateCardVersionAction(clientId, rateCardId, undefined, formData)
        : await createRateCardAction(clientId, undefined, formData);
      if (result?.message) {
        setSaveError(result.errors ?? [result.message]);
        setStep({ kind: "preview", preview });
        return;
      }
      onDone?.();
    } catch {
      setSaveError(["Something went wrong saving the rate card. Try again."]);
      setStep({ kind: "preview", preview });
    }
  }

  const busy = step.kind === "checking" || step.kind === "saving";
  const preview = step.kind === "preview" || step.kind === "saving" ? step.preview : null;

  return (
    <div className="space-y-3">
      {!preview && (
        <>
          <p className="text-sm text-muted-foreground">
            Rate cards are uploaded as Excel (.xlsx).{" "}
            <a href={RATE_CARD_TEMPLATE_URL} className="font-medium text-primary underline" download>
              Download template
            </a>
          </p>
          {!rateCardId && (
            <div>
              <Label htmlFor={nameId}>Name</Label>
              <Input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor={fileId}>Rate card file (.xlsx)</Label>
            <input
              id={fileId}
              type="file"
              accept={RATE_CARD_ACCEPT_ATTRIBUTE}
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStep({ kind: "choose" });
              }}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          {step.kind === "errors" && (
            <div role="alert" className="rounded-md border border-danger/40 p-3 text-sm text-danger">
              <p className="font-medium">
                {step.errors.length > 1 ? `${step.errors.length} problems to fix:` : "Problem:"}
              </p>
              <ul className="mt-1 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5">
                {step.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            onClick={handleCheck}
            disabled={busy || (!rateCardId && name.trim() === "")}
          >
            {step.kind === "checking" ? "Checking…" : "Check file"}
          </Button>
        </>
      )}

      {preview && (
        <div className="space-y-3" data-testid="rate-card-preview">
          <p className="text-sm font-medium text-foreground">
            {preview.fileName}: {preview.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            Effective {preview.effectiveFrom}
            {preview.effectiveTo ? ` to ${preview.effectiveTo}` : ""}. Nothing is saved until you confirm.
          </p>
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-muted text-muted-foreground">
                <tr>
                  {["Role", "Grade/Level", "Currency", "Rate", "Unit", "From", "To", "Capability"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.lines.slice(0, PREVIEW_ROW_LIMIT).map((line) => (
                  <tr key={line.sourceRow} className="border-t border-border">
                    <td className="px-2 py-1">{line.role}</td>
                    <td className="px-2 py-1">{line.grade ?? ""}</td>
                    <td className="px-2 py-1">{line.currency}</td>
                    <td className="px-2 py-1 tabular-nums">{line.rate}</td>
                    <td className="px-2 py-1">{line.unit}</td>
                    <td className="px-2 py-1">{line.effectiveFrom}</td>
                    <td className="px-2 py-1">{line.effectiveTo ?? ""}</td>
                    <td className="px-2 py-1">{line.capability ? capabilityLabel(line.capability) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.lines.length > PREVIEW_ROW_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Showing the first {PREVIEW_ROW_LIMIT} of {preview.lines.length} rates. All of them will be saved.
            </p>
          )}
          {saveError && (
            <div role="alert" className="text-sm text-danger">
              {saveError.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={() => handleConfirm(preview)} disabled={step.kind === "saving"}>
              {step.kind === "saving" ? "Saving…" : "Confirm and save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={step.kind === "saving"}
              onClick={() => {
                setSaveError(null);
                setFile(null);
                setStep({ kind: "choose" });
              }}
            >
              Choose a different file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
