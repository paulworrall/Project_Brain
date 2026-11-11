"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setClarificationSentAction } from "@/app/(dashboard)/projects/[projectId]/step-actions";
import type { ClarificationEmail } from "@/types/intake";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatUkDateTime } from "@/lib/updateLabel";

function downloadClarificationEmail(email: ClarificationEmail) {
  const text = `Subject: ${email.subject}\n\n${email.bodyText}`;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clarification-email.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Compact summary only — the full email body used to render inline here,
 * which was the biggest single contributor to Phase 1's page length. Full
 * content now lives at the Outputs Library / Version History view, the one
 * canonical place documents render in full, rather than duplicating that
 * rendering logic on this page too.
 */
/** The latest email version, to say when it's a new draft triggered by an update. */
export interface ClarificationEmailDraftMeta {
  versionNumber: number;
  /** The update whose saving drafted this version automatically; null otherwise. */
  triggeredByUpdateVersion: number | null;
  createdAt: Date;
}

/**
 * FB-009: an action card — draft, copy or download, then "Mark as sent" once
 * the PM has sent it themselves (the app never sends). Shown only while the
 * Scope summary has open questions.
 */
export function ClarificationEmailCard({
  projectId,
  email,
  draft,
  sentAt = null,
  openQuestionCount,
  readOnly = false,
}: {
  draft?: ClarificationEmailDraftMeta | null;
  projectId: string;
  email: ClarificationEmail | null;
  /** When the PM marked it as sent (ISO), or null. */
  sentAt?: string | null;
  openQuestionCount?: number;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "error" | "status"; text: string } | null>(null);

  function markSent(sent: boolean) {
    setStatus(null);
    startTransition(async () => {
      const result = await setClarificationSentAction({ projectId, sent });
      setStatus(
        result.ok
          ? { kind: "status", text: sent ? "Marked as sent." : "Marked as not sent." }
          : { kind: "error", text: result.message }
      );
    });
  }

  async function copy() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.bodyText}`);
      setStatus({ kind: "status", text: "Email copied." });
    } catch {
      setStatus({ kind: "error", text: "Couldn't copy — use Download instead." });
    }
  }

  return (
    <div id="clarification-email" className="scroll-mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Clarification email
          {openQuestionCount !== undefined && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {openQuestionCount} open question{openQuestionCount === 1 ? "" : "s"}
            </span>
          )}
        </h3>
        {email && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => void copy()}
            >
              Copy
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => downloadClarificationEmail(email)}
            >
              Download
            </Button>
            {!readOnly &&
              (sentAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={pending}
                  onClick={() => markSent(false)}
                >
                  Mark as not sent
                </Button>
              ) : (
                <Button
                  type="button"
                  className="text-xs"
                  disabled={pending}
                  onClick={() => markSent(true)}
                >
                  Mark as sent
                </Button>
              ))}
          </div>
        )}
      </div>
      {sentAt && (
        <p className="mb-2 text-xs text-foreground">
          <span aria-hidden="true">✓ </span>Sent {formatUkDateTime(new Date(sentAt))}. Drafts are no
          longer rewritten automatically.
        </p>
      )}
      <p
        role={status?.kind === "error" ? "alert" : "status"}
        className={status?.kind === "error" ? "mb-2 text-xs text-danger" : "sr-only"}
      >
        {status?.text}
      </p>
      {email ? (
        <Card className="space-y-1 p-4">
          {draft?.triggeredByUpdateVersion != null && (
            <p role="status" aria-label="New draft" className="text-xs font-medium text-primary">
              New draft ready (v{draft.versionNumber}) — from update v
              {draft.triggeredByUpdateVersion} · {formatUkDateTime(draft.createdAt)}
            </p>
          )}
          <p className="text-sm font-medium text-foreground">{email.subject}</p>
          <p className="text-xs text-muted-foreground">
            Draft — never sent automatically · {wordCount(email.bodyText)} words
          </p>
          <Link
            href={`/projects/${projectId}/outputs/CLARIFICATION_EMAIL`}
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            View full email →
          </Link>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Not yet generated.</p>
        </Card>
      )}
    </div>
  );
}
