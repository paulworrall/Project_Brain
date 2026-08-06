import type { ClarificationEmail } from "@/types/intake";
import { Card } from "@/components/ui/Card";

export function ClarificationEmailView({ email }: { email: ClarificationEmail }) {
  return (
    <Card className="p-5">
      <p className="mb-3 rounded-md bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning">
        Draft — review before sending. Never sent automatically.
      </p>
      <p className="text-sm font-semibold text-foreground">{email.subject}</p>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-foreground">
        {email.bodyText}
      </pre>
    </Card>
  );
}
