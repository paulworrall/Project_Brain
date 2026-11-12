"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError } from "@/components/ui/FormError";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import { INTAKE_PROCESSING_STAGES, INTAKE_STAGE_DURATIONS_MS } from "@/lib/intakeProcessingStages";
import { formatRateCardLabel } from "@/lib/formatRateCardLabel";
import { BRIEF_ACCEPT_ATTRIBUTE, validateBriefFileMeta } from "@/lib/briefFileRules";
import { PmPerspectiveFields } from "@/components/features/PmPerspectiveFields";
import {
  createProjectAction,
  getClientProjectDefaultsAction,
  previewBriefFileAction,
  type BriefFilePreviewResult,
  type ClientProjectDefaults,
  type RateCardOption,
} from "./actions";

type BriefInputMode = "paste" | "upload";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function defaultRateCardVersionId(rateCard: RateCardOption | undefined): string {
  if (!rateCard) return "";
  const flaggedCurrent = rateCard.versions.find((v) => v.status === "ENABLED");
  return (flaggedCurrent ?? rateCard.versions[0])?.id ?? "";
}

/**
 * FB-009 E: the short New Project form. Required: Client and Brief. Optional:
 * project name (the Intake Agent suggests one if blank) and PM (defaults to
 * the current user). MSA and rate card default to the client's current
 * versions, shown as "Using: …" with "Change" to reveal the selectors. Job
 * number and dates are set later in the project header.
 */
export function NewProjectForm({
  clientOptions,
  pmOptions = [],
  defaultPmId = "",
}: {
  clientOptions: { id: string; name: string }[];
  /** Users who can be PM (Delivery role). */
  pmOptions?: { id: string; name: string }[];
  /** The current user when they can be PM; "" otherwise. */
  defaultPmId?: string;
}) {
  const [state, formAction, pending] = useActionState(createProjectAction, undefined);
  const [briefMode, setBriefMode] = useState<BriefInputMode>("paste");
  const [clientId, setClientId] = useState("");
  const [defaults, setDefaults] = useState<ClientProjectDefaults | null>(null);
  const [workstreamId, setWorkstreamId] = useState("");
  const [projectManagerId, setProjectManagerId] = useState(defaultPmId);
  const [showCommercials, setShowCommercials] = useState(false);
  // Controlled (not left uncontrolled) specifically so a failed submission
  // doesn't lose them: React resets uncontrolled fields once a <form
  // action> call completes, success or failure — for the brief text in
  // particular, that would silently wipe out what the user pasted right
  // when the processing-overlay error/retry path needs it to still be
  // there.
  const [name, setName] = useState("");
  const [briefText, setBriefText] = useState("");
  // Same reasoning — the PM perspective must survive a failed submission.
  const [pmPerspective, setPmPerspective] = useState<Record<string, string>>({});

  const [rateCardId, setRateCardId] = useState("");
  const [rateCardVersionId, setRateCardVersionId] = useState("");

  const [isCheckingClient, startClientCheck] = useTransition();

  // Brief file: the native <input type="file"> stays the source of truth for
  // what's submitted (it's in the form's FormData); this state only mirrors
  // it for validation feedback and the extracted-text preview. Pasting and
  // uploading are mutually exclusive — only the active mode's field is
  // rendered, so only one can ever be submitted.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreview, setFilePreview] = useState<Extract<
    BriefFilePreviewResult,
    { ok: true }
  > | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  // React resets the form (including the native file input) after every
  // action completes, success or failure. Keeping the File here lets a failed
  // submission be retried from the overlay without re-choosing the file.
  const briefFileRef = useRef<File | null>(null);

  function clearBriefFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    briefFileRef.current = null;
    setFilePreview(null);
    setFileError(null);
    setIsReadingFile(false);
  }

  function restoreBriefFileInput() {
    const input = fileInputRef.current;
    const file = briefFileRef.current;
    if (!input || !file || input.files?.length) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      // Older browsers: the file is still re-attached on submit by submitBrief.
    }
  }

  function submitBrief(formData: FormData) {
    const attached = formData.get("briefFile");
    if (briefFileRef.current && !(attached instanceof File && attached.size > 0)) {
      formData.set("briefFile", briefFileRef.current);
    }
    return formAction(formData);
  }

  function handleBriefModeChange(mode: BriefInputMode) {
    if (mode === briefMode) return;
    clearBriefFile();
    setBriefMode(mode);
  }

  async function handleBriefFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFilePreview(null);
    setFileError(null);
    if (!file) return;

    const metaError = validateBriefFileMeta({ name: file.name, size: file.size, type: file.type });
    if (metaError) {
      e.target.value = "";
      setFileError(metaError);
      return;
    }

    setIsReadingFile(true);
    try {
      const body = new FormData();
      body.set("briefFile", file);
      const result = await previewBriefFileAction(body);
      if (fileInputRef.current?.files?.[0] !== file) return; // replaced or removed meanwhile
      if (result.ok) {
        briefFileRef.current = file;
        setFilePreview(result);
      } else {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setFileError(result.error);
      }
    } catch {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileError("We couldn't check this file. Try again, or paste the brief text instead.");
    } finally {
      setIsReadingFile(false);
    }
  }

  // Processing overlay — shown for both pasted and uploaded briefs (both
  // run the same Intake Agent call via createProjectAction). The Intake Agent call is a single blocking Server Action with no real
  // per-stage progress signal (see intake-agent.ts), so stageIndex below
  // comes from a time-based fallback (useFallbackStageProgress) rather than
  // real events — swapping in real events later only means changing what
  // feeds `stageIndex`/`isFinalHold` into ProcessingOverlay, not its props.
  const formRef = useRef<HTMLFormElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<ProcessingOverlayStatus>("active");
  const wasPendingRef = useRef(pending);

  const fallbackActive = overlayOpen && overlayStatus === "active";
  const { stageIndex, isFinalHold, elapsedInFinalHoldMs } = useFallbackStageProgress(
    fallbackActive,
    INTAKE_STAGE_DURATIONS_MS
  );

  useEffect(() => {
    // The action always redirects on success and only ever returns (without
    // navigating away) on failure — field-validation errors, MSA/rate-card
    // checks, brief-parsing errors, or an IntakeAgentError all come back as
    // `state` with the component still mounted. So any pending:true -> false
    // transition that leaves this component mounted is, by construction, a
    // failure — regardless of whether `state.message` is set or only
    // per-field `state.errors` are.
    if (wasPendingRef.current && !pending && overlayOpen && overlayStatus === "active") {
      setOverlayStatus("error");
      restoreBriefFileInput();
    }
    wasPendingRef.current = pending;
  }, [pending, overlayOpen, overlayStatus]);

  function handleFormSubmit() {
    // Set synchronously in the submit handler (not a useEffect reacting to
    // `pending`) so the overlay appears the same frame as the click, before
    // the Server Action round-trip even starts.
    setOverlayOpen(true);
    setOverlayStatus("active");
  }

  function handleRetry() {
    // Re-clicks the real submit button rather than calling requestSubmit()
    // or the formAction dispatcher directly — both proved unreliable at
    // triggering a fresh dispatch in practice, whereas re-clicking the same
    // element that started the original submission goes through the exact
    // same native click -> submit-event path.
    submitButtonRef.current?.click();
  }

  function handleDismissError() {
    setOverlayOpen(false);
  }

  function handleClientChange(value: string) {
    setClientId(value);
    setDefaults(null);
    setWorkstreamId("");
    setRateCardId("");
    setRateCardVersionId("");
    setShowCommercials(false);
    if (!value) return;

    startClientCheck(async () => {
      const result = await getClientProjectDefaultsAction(value);
      setDefaults(result);
      setWorkstreamId(result.workstreams.length === 1 ? result.workstreams[0].id : "");
      setRateCardId(result.defaultRateCard?.rateCardId ?? "");
      setRateCardVersionId(result.defaultRateCard?.rateCardVersionId ?? "");
    });
  }

  function handleRateCardChange(value: string) {
    setRateCardId(value);
    setRateCardVersionId(
      defaultRateCardVersionId(defaults?.rateCards.find((rc) => rc.id === value))
    );
  }

  const rateCardOptions = defaults?.rateCards ?? [];
  const selectedRateCard = rateCardOptions.find((rc) => rc.id === rateCardId);
  const msaOption = defaults?.msa ?? null;
  const loaded = clientId !== "" && !isCheckingClient && defaults !== null;
  const needsWorkstream = loaded && defaults.workstreams.length > 1;
  const noWorkstream = loaded && defaults.workstreams.length === 0;
  const selectedVersion = selectedRateCard?.versions.find((v) => v.id === rateCardVersionId);
  const usingRateCard = selectedRateCard
    ? `${formatRateCardLabel(selectedRateCard.name, selectedRateCard.currency)}${selectedVersion ? ` v${selectedVersion.versionNumber}` : ""}`
    : "no rate card";
  const usingMsa = msaOption ? msaOption.fileName : "no MSA";
  // The project can be created without an MSA or rate card (FB-009 E).
  const canSubmit =
    !pending && loaded && !noWorkstream && (!needsWorkstream || workstreamId !== "");

  return (
    <form ref={formRef} action={submitBrief} onSubmit={handleFormSubmit} className="space-y-5">
      <div>
        <Label htmlFor="clientId">Client</Label>
        <select
          id="clientId"
          name="clientId"
          value={clientId}
          onChange={(e) => handleClientChange(e.target.value)}
          required
          className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="" disabled>
            Select a client…
          </option>
          {clientOptions.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <FormError>{state?.errors?.clientId}</FormError>
        {isCheckingClient && (
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            Checking the client&apos;s agreements…
          </p>
        )}
        {noWorkstream && (
          <p className="mt-1 text-sm text-danger" role="alert">
            This client has no workstream yet. An Admin needs to add one before you can create a
            project.
          </p>
        )}
      </div>

      {needsWorkstream ? (
        <div>
          <Label htmlFor="workstreamId">Workstream</Label>
          <select
            id="workstreamId"
            name="workstreamId"
            value={workstreamId}
            onChange={(e) => setWorkstreamId(e.target.value)}
            required
            className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="" disabled>
              Select a workstream…
            </option>
            {defaults!.workstreams.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <FormError>{state?.errors?.workstreamId}</FormError>
        </div>
      ) : (
        <input type="hidden" name="workstreamId" value={workstreamId} />
      )}

      {loaded && !noWorkstream && (
        <div className="space-y-2 border border-border bg-surface-muted px-3 py-2 text-sm">
          <p className="text-foreground">
            <span className="font-medium">Using:</span> {usingMsa}, {usingRateCard}{" "}
            <button
              type="button"
              aria-expanded={showCommercials}
              onClick={() => setShowCommercials((v) => !v)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {showCommercials ? "Done" : "Change"}
            </button>
          </p>
          {!msaOption && (
            <p className="text-foreground" role="note">
              <span aria-hidden="true">! </span>This client has no Master Service Agreement on file.
              An Admin needs to add it. You can still create the project.
            </p>
          )}
          {rateCardOptions.length === 0 && (
            <p className="text-foreground" role="note">
              <span aria-hidden="true">! </span>This client has no rate card. An Admin needs to add
              one. You can still create the project.
            </p>
          )}
          <input type="hidden" name="masterServiceAgreementId" value={msaOption?.id ?? ""} />
          {showCommercials ? (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">
                The MSA is the client&apos;s current one
                {msaOption ? ` (effective from ${formatDate(msaOption.effectiveFrom)})` : ""}.
              </p>
              <div>
                <Label htmlFor="rateCardId">Rate card</Label>
                <select
                  id="rateCardId"
                  name="rateCardId"
                  value={rateCardId}
                  onChange={(e) => handleRateCardChange(e.target.value)}
                  disabled={rateCardOptions.length === 0}
                  className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
                >
                  <option value="">No rate card</option>
                  {rateCardOptions.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {formatRateCardLabel(rc.name, rc.currency)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRateCard && (
                <div>
                  <Label htmlFor="rateCardVersionId">Rate card version</Label>
                  <select
                    id="rateCardVersionId"
                    name="rateCardVersionId"
                    value={rateCardVersionId}
                    onChange={(e) => setRateCardVersionId(e.target.value)}
                    className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    <option value="" disabled>
                      Select a version…
                    </option>
                    {selectedRateCard.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.versionNumber} — {v.fileName}
                        {v.currencies.length > 0 ? ` [${v.currencies.join(", ")}]` : ""}
                        {v.status === "ENABLED" ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <>
              <input type="hidden" name="rateCardId" value={rateCardId} />
              <input type="hidden" name="rateCardVersionId" value={rateCardVersionId} />
            </>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="brief">Brief</Label>
        <div className="mb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="briefMode"
              checked={briefMode === "paste"}
              onChange={() => handleBriefModeChange("paste")}
            />
            Paste text
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="briefMode"
              checked={briefMode === "upload"}
              onChange={() => handleBriefModeChange("upload")}
            />
            Upload file
          </label>
        </div>

        {briefMode === "paste" ? (
          <textarea
            id="brief"
            name="briefText"
            rows={8}
            placeholder="Paste the client brief here…"
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        ) : (
          <div>
            <input
              ref={fileInputRef}
              id="brief"
              name="briefFile"
              type="file"
              accept={BRIEF_ACCEPT_ATTRIBUTE}
              onChange={handleBriefFileChange}
              aria-describedby="brief-file-help"
              className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
            <p id="brief-file-help" className="mt-1 text-xs text-muted-foreground">
              Word (.docx), PDF, or text file, up to 8 MB. Uploading replaces pasted text.
            </p>
            {isReadingFile && (
              <p className="mt-1.5 text-sm text-muted-foreground" role="status">
                Reading file…
              </p>
            )}
            {filePreview && (
              <div
                className="mt-2 border border-border bg-surface p-3 text-sm"
                data-testid="brief-file-preview"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">
                    {filePreview.fileName}{" "}
                    <span className="font-normal text-muted-foreground">
                      — {filePreview.charCount.toLocaleString("en-GB")} characters read
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={clearBriefFile}
                    className="text-sm text-muted-foreground underline hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {filePreview.preview}
                  {filePreview.charCount > filePreview.preview.length ? "…" : ""}
                </p>
              </div>
            )}
            <FormError>{fileError ?? state?.errors?.briefFile}</FormError>
          </div>
        )}
        <FormError>{state?.errors?.briefText}</FormError>
      </div>

      <div>
        <Label htmlFor="name">Project name (optional)</Label>
        <Input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby="name-help"
        />
        <p id="name-help" className="mt-1 text-xs text-muted-foreground">
          Leave blank and we&apos;ll suggest one from the brief.
        </p>
        <FormError>{state?.errors?.name}</FormError>
      </div>

      <div>
        <Label htmlFor="projectManagerId">Project manager (optional)</Label>
        <select
          id="projectManagerId"
          name="projectManagerId"
          value={projectManagerId}
          onChange={(e) => setProjectManagerId(e.target.value)}
          className="w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">Not yet set</option>
          {pmOptions.map((pm) => (
            <option key={pm.id} value={pm.id}>
              {pm.name}
              {pm.id === defaultPmId ? " (you)" : ""}
            </option>
          ))}
        </select>
        <FormError>{state?.errors?.projectManagerId}</FormError>
      </div>

      <PmPerspectiveFields
        values={pmPerspective}
        onChange={(fieldId, value) =>
          setPmPerspective((current) => ({ ...current, [fieldId]: value }))
        }
      />

      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}

      <Button ref={submitButtonRef} type="submit" disabled={!canSubmit} className="w-full">
        {pending ? "Running Intake Agent…" : "Create project"}
      </Button>

      <ProcessingOverlay
        isOpen={overlayOpen}
        title="Setting up your project"
        stages={[...INTAKE_PROCESSING_STAGES]}
        stageIndex={stageIndex}
        status={overlayStatus}
        isFinalHold={isFinalHold}
        elapsedInFinalHoldMs={elapsedInFinalHoldMs}
        errorMessage={state?.message ?? state?.errors?.briefFile?.[0]}
        onRetry={handleRetry}
        onDismissError={handleDismissError}
      />
    </form>
  );
}
