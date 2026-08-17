"use client";

import type { ClarificationEmail } from "@/types/intake";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ClarificationEmailView } from "./ClarificationEmailView";

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

export function ClarificationEmailCard({ email }: { email: ClarificationEmail | null }) {
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
        <ClarificationEmailView email={email} />
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Not yet generated.</p>
        </Card>
      )}
    </div>
  );
}
