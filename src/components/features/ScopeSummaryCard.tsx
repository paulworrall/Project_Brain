"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingOverlay, type ProcessingOverlayStatus } from "@/components/ui/ProcessingOverlay";
import { useFallbackStageProgress } from "@/hooks/useFallbackStageProgress";
import {
  SCOPE_SUMMARY_PROCESSING_STAGES,
  SCOPE_SUMMARY_STAGE_DURATIONS_MS,
} from "@/lib/scopeSummaryProcessingStages";
import { SCOPE_SECTIONS, type ScopeSummaryContent, type ScopeStoredSectionId } from "@/types/scope";
import type { ScopeViewSection } from "@/lib/scopeSummaryView";
import {
  confirmScopeAction,
  editScopeSummaryAction,
} from "@/app/(dashboard)/projects/[projectId]/step-actions";
import {
  createScopeSummaryFromEarlierAction,
  regenerateScopeSummaryAction,
} from "@/app/(dashboard)/projects/[projectId]/scope-actions";
import { ScopeSummarySections } from "./ScopeSummarySections";
import type { ReactNode } from "react";

/**
 * FB-009: the Scope summary — the one scope document, in the Brief step.
 * View → Edit (each save is a new version) → Regenerate (a new version from
 * the brief and every update). Key details appear read-only in their sections.
 * When the scope is confirmed and a newer version exists, offers to confirm
 * the newer one (which is what flags the estimate as needing review).
 */

export interface ScopeSummaryCardData {
  versionId: string;
  versionNumber: number;
  createdAt: Date;
  content: ScopeSummaryContent;
  sections: ScopeViewSection[];
  /** The confirmed version's number, if the scope is confirmed. */
  confirmedVersionNumber: number | null;
}

type Draft = Record<ScopeStoredSectionId, string>;

function toDraft(content: ScopeSummaryContent): Draft {
  return {
    context: content.context,
    outOfScope: content.outOfScope.join("\n"),
    deliverables: content.deliverables.join("\n"),
    constraints: content.constraints.join("\n"),
    assumptions: content.assumptions.join("\n"),
    openQuestions: content.openQuestions.join("\n"),
  };
}

function fromDraft(draft: Draft): ScopeSummaryContent {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    context: draft.context.trim(),
    outOfScope: lines(draft.outOfScope),
    deliverables: lines(draft.deliverables),
    constraints: lines(draft.constraints),
    assumptions: lines(draft.assumptions),
    openQuestions: lines(draft.openQuestions),
  };
}

const FIELD_LABEL: Record<ScopeStoredSectionId, string> = {
  context: "Context",
  outOfScope: "Out of scope",
  deliverables: "Deliverables",
  constraints: "Other constraints (timeline and budget come from the key details)",
  assumptions: "Assumptions",
  openQuestions: "Open questions",
};

function useAgentOverlay(onDone: () => void) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProcessingOverlayStatus>("active");
  const [error, setError] = useState<string | undefined>();
  const progress = useFallbackStageProgress(
    open && status === "active",
    SCOPE_SUMMARY_STAGE_DURATIONS_MS
  );
  useEffect(() => {
    if (open && status === "success") {
      const timeout = setTimeout(() => {
        setOpen(false);
        onDone();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [open, status, onDone]);
  return { open, setOpen, status, setStatus, error, setError, progress };
}

export function ScopeSummaryCard({
  projectId,
  summary,
  readOnly,
  assessment,
  canCreateFromEarlier,
}: {
  projectId: string;
  summary: ScopeSummaryCardData | null;
  readOnly: boolean;
  /** Brief completeness from the Intake Agent (FB-009 D), shown on the card. */
  assessment?: ReactNode;
  /** A pre-FB-009 project with earlier documents and no Scope summary yet. */
  canCreateFromEarlier: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "status"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastAgentRun, setLastAgentRun] = useState<"regenerate" | "create">("regenerate");
  const refresh = useCallback(() => router.refresh(), [router]);
  const overlay = useAgentOverlay(refresh);
  const headingId = useId();

  function runAgent(kind: "regenerate" | "create") {
    setLastAgentRun(kind);
    overlay.setError(undefined);
    overlay.setStatus("active");
    overlay.setOpen(true);
    startTransition(async () => {
      const result =
        kind === "regenerate"
          ? await regenerateScopeSummaryAction(projectId)
          : await createScopeSummaryFromEarlierAction(projectId);
      if (result.ok) {
        overlay.setStatus("success");
        setMessage({ kind: "status", text: `Scope summary v${result.data.versionNumber} saved.` });
      } else {
        overlay.setError(result.message);
        overlay.setStatus("error");
      }
    });
  }

  function save() {
    if (!summary || !draft) return;
    setMessage(null);
    startTransition(async () => {
      const result = await editScopeSummaryAction({
        projectId,
        baseVersionId: summary.versionId,
        content: fromDraft(draft),
      });
      if (result.ok) {
        setEditing(false);
        setMessage({
          kind: "status",
          text:
            result.data.changedSections.length > 0
              ? `Saved as v${result.data.versionNumber} · Changed: ${result.data.changedSections.join(", ")}`
              : "No changes to save.",
        });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  function confirmLatest() {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmScopeAction({ projectId });
      setMessage(
        result.ok
          ? { kind: "status", text: `Scope confirmed at v${summary?.versionNumber}.` }
          : { kind: "error", text: result.message }
      );
    });
  }

  const newerThanConfirmed =
    summary !== null &&
    summary.confirmedVersionNumber !== null &&
    summary.versionNumber > summary.confirmedVersionNumber;

  return (
    <Card
      id="scope-summary"
      role="region"
      className="scroll-mt-6 space-y-4 p-4"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-base font-medium text-foreground">
            Scope summary
          </h3>
          {summary && (
            <p className="text-xs text-muted-foreground">
              v{summary.versionNumber}
              {summary.confirmedVersionNumber !== null &&
                (summary.confirmedVersionNumber === summary.versionNumber
                  ? " · confirmed"
                  : ` · v${summary.confirmedVersionNumber} confirmed`)}
            </p>
          )}
        </div>
        {summary && !readOnly && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={pending}
              onClick={() => {
                setDraft(toDraft(summary.content));
                setEditing(true);
                setMessage(null);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={pending}
              onClick={() => runAgent("regenerate")}
            >
              Regenerate
            </Button>
          </div>
        )}
      </div>

      {assessment}

      {newerThanConfirmed && !readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-warning bg-warning-bg px-3 py-2 text-sm text-foreground">
          <p>
            <span aria-hidden="true">● </span>v{summary!.versionNumber} has changes since the
            confirmed v{summary!.confirmedVersionNumber}.
          </p>
          <Button type="button" className="text-xs" disabled={pending} onClick={confirmLatest}>
            Confirm v{summary!.versionNumber}
          </Button>
        </div>
      )}

      {!summary ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {canCreateFromEarlier
              ? "This project was set up before scope summaries. Create one from its earlier documents below."
              : "No scope summary yet."}
          </p>
          {!readOnly && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => runAgent(canCreateFromEarlier ? "create" : "regenerate")}
            >
              {canCreateFromEarlier ? "Create scope summary from these" : "Draft the scope summary"}
            </Button>
          )}
        </div>
      ) : editing && draft ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {SCOPE_SECTIONS.filter((s) => s.stored).map((section) => {
            const field = section.stored!;
            const id = `${headingId}-${field}`;
            return (
              <div key={field}>
                <label htmlFor={id} className="block text-xs font-medium text-foreground">
                  {FIELD_LABEL[field]}
                  {field !== "context" && (
                    <span className="font-normal text-muted-foreground"> — one per line</span>
                  )}
                </label>
                <textarea
                  id={id}
                  rows={field === "context" ? 4 : 3}
                  value={draft[field]}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  className="mt-1 w-full border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
                />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Objectives, in-scope details, timeline and budget are key details — edit them under
            &quot;What We Need to Find Out&quot;.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save as new version"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <ScopeSummarySections sections={summary.sections} />
      )}

      <p
        role={message?.kind === "error" ? "alert" : "status"}
        className={
          message?.kind === "error" ? "text-xs text-danger" : "text-xs text-muted-foreground"
        }
      >
        {message?.text}
      </p>

      <ProcessingOverlay
        isOpen={overlay.open}
        title={
          lastAgentRun === "create"
            ? "Creating the scope summary"
            : "Regenerating the scope summary"
        }
        stages={[...SCOPE_SUMMARY_PROCESSING_STAGES]}
        stageIndex={overlay.progress.stageIndex}
        status={overlay.status}
        isFinalHold={overlay.progress.isFinalHold}
        elapsedInFinalHoldMs={overlay.progress.elapsedInFinalHoldMs}
        errorMessage={overlay.error}
        successMessage="Scope summary saved as a new version."
        onRetry={() => runAgent(lastAgentRun)}
        onDismissError={() => overlay.setOpen(false)}
      />
    </Card>
  );
}
