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
import {
  createProjectAction,
  getRateCardsForWorkstreamAction,
  getMasterServiceAgreementForWorkstreamAction,
  type RateCardOption,
  type MasterServiceAgreementOption,
} from "./actions";

type BriefInputMode = "paste" | "upload";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

function defaultRateCardVersionId(rateCard: RateCardOption | undefined): string {
  if (!rateCard) return "";
  const flaggedCurrent = rateCard.versions.find((v) => v.status === "ENABLED");
  return (flaggedCurrent ?? rateCard.versions[0])?.id ?? "";
}

export function NewProjectForm({
  workstreamOptions,
}: {
  workstreamOptions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(createProjectAction, undefined);
  const [briefMode, setBriefMode] = useState<BriefInputMode>("paste");
  const [workstreamId, setWorkstreamId] = useState("");
  // Controlled (not left uncontrolled) specifically so a failed submission
  // doesn't lose them: React resets uncontrolled fields once a <form
  // action> call completes, success or failure — for the brief text in
  // particular, that would silently wipe out what the user pasted right
  // when the processing-overlay error/retry path needs it to still be
  // there.
  const [name, setName] = useState("");
  const [briefText, setBriefText] = useState("");

  const [rateCardOptions, setRateCardOptions] = useState<RateCardOption[]>([]);
  const [rateCardId, setRateCardId] = useState("");
  const [rateCardVersionId, setRateCardVersionId] = useState("");

  // null = "no MSA for this client"; undefined = "not checked yet" (no
  // Workstream chosen, or the check is still in flight) — kept distinct from
  // null so the "no MSA" warning never flashes before the real check
  // resolves.
  const [msaOption, setMsaOption] = useState<MasterServiceAgreementOption | null | undefined>(
    undefined
  );

  const [isCheckingClient, startClientCheck] = useTransition();

  // Processing overlay — scoped to the plain-text ("paste") brief path only;
  // file upload is broken separately (FB-002) and out of scope here. The
  // Intake Agent call is a single blocking Server Action with no real
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
    }
    wasPendingRef.current = pending;
  }, [pending, overlayOpen, overlayStatus]);

  function handleFormSubmit() {
    if (briefMode !== "paste") return;
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

  function handleWorkstreamChange(value: string) {
    setWorkstreamId(value);
    setRateCardOptions([]);
    setRateCardId("");
    setRateCardVersionId("");
    setMsaOption(undefined);
    if (!value) return;

    startClientCheck(async () => {
      const [rateCards, msa] = await Promise.all([
        getRateCardsForWorkstreamAction(value),
        getMasterServiceAgreementForWorkstreamAction(value),
      ]);
      setRateCardOptions(rateCards);
      setMsaOption(msa);
    });
  }

  function handleRateCardChange(value: string) {
    setRateCardId(value);
    setRateCardVersionId(defaultRateCardVersionId(rateCardOptions.find((rc) => rc.id === value)));
  }

  const selectedRateCard = rateCardOptions.find((rc) => rc.id === rateCardId);
  const clientHasNoMsa = workstreamId !== "" && !isCheckingClient && msaOption === null;
  // Requires an actual, confirmed MSA — not just "haven't found out yet" —
  // so the button stays disabled before any Workstream is chosen, not only
  // once a client is positively confirmed to have none.
  const canSubmit = !pending && !isCheckingClient && msaOption != null;

  return (
    <form ref={formRef} action={formAction} onSubmit={handleFormSubmit} className="space-y-5">
      <div>
        <Label htmlFor="workstreamId">Workstream</Label>
        <select
          id="workstreamId"
          name="workstreamId"
          value={workstreamId}
          onChange={(e) => handleWorkstreamChange(e.target.value)}
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="" disabled>
            Select a workstream…
          </option>
          {workstreamOptions.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.label}
            </option>
          ))}
        </select>
        <FormError>{state?.errors?.workstreamId}</FormError>
      </div>

      <div>
        <Label htmlFor="name">Project name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FormError>{state?.errors?.name}</FormError>
      </div>

      <div>
        <Label htmlFor="masterServiceAgreementId">Master Service Agreement</Label>
        <select
          id="masterServiceAgreementId"
          name="masterServiceAgreementId"
          value={msaOption?.id ?? ""}
          disabled={!msaOption}
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring disabled:opacity-60"
        >
          <option value="" disabled>
            {!workstreamId
              ? "Select a workstream first"
              : isCheckingClient
                ? "Checking…"
                : clientHasNoMsa
                  ? "No MSA on file for this client"
                  : "Select…"}
          </option>
          {msaOption && (
            <option value={msaOption.id}>
              {msaOption.fileName} (effective from {formatDate(msaOption.effectiveFrom)})
            </option>
          )}
        </select>
        {clientHasNoMsa && (
          <p className="mt-1 text-sm text-danger" role="alert">
            This client has no Master Service Agreement on file. Contact Client Engagement to add
            one before creating a project.
          </p>
        )}
        <FormError>{state?.errors?.masterServiceAgreementId}</FormError>
      </div>

      <div>
        <Label htmlFor="rateCardId">Rate card (optional)</Label>
        <select
          id="rateCardId"
          name="rateCardId"
          value={rateCardId}
          onChange={(e) => handleRateCardChange(e.target.value)}
          disabled={rateCardOptions.length === 0}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring disabled:opacity-60"
        >
          <option value="">
            {workstreamId
              ? rateCardOptions.length === 0
                ? "No rate cards for this client"
                : "No rate card"
              : "Select a workstream first"}
          </option>
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
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            <option value="" disabled>
              Select a version…
            </option>
            {selectedRateCard.versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.versionNumber} — {v.fileName}
                {v.status === "ENABLED" ? " (current)" : ""}
              </option>
            ))}
          </select>
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
              onChange={() => setBriefMode("paste")}
            />
            Paste text
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="briefMode"
              checked={briefMode === "upload"}
              onChange={() => setBriefMode("upload")}
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
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          />
        ) : (
          <input
            id="brief"
            name="briefFile"
            type="file"
            accept=".docx,.pdf,.pptx,.txt"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        )}
        <FormError>{state?.errors?.briefText}</FormError>
      </div>

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
        errorMessage={state?.message}
        onRetry={handleRetry}
        onDismissError={handleDismissError}
      />
    </form>
  );
}
