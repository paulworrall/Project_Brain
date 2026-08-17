"use client";

import Link from "next/link";
import type { ClarificationEmail } from "@/types/intake";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
export function ClarificationEmailCard({
  projectId,
  email,
}: {
  projectId: string;
  email: ClarificationEmail | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Clarification email</h3>
        {email && (
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            onClick={() => downloadClarificationEmail(email)}
          >
            Download
          </Button>
        )}
      </div>
      {email ? (
        <Card className="space-y-1 p-4">
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
