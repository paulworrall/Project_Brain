import { Card } from "@/components/ui/Card";

export function ChatPanel({ projectName }: { projectName: string }) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Project Brain</h2>
        <p className="text-xs text-muted-foreground">Ask anything about {projectName}</p>
      </div>

      <div className="mt-4 flex-1 rounded-md bg-surface-muted p-3 text-sm text-muted-foreground">
        Project-scoped Q&A chatbot — coming in tasks 8.3–8.4. Answers will be grounded strictly
        in this project&apos;s own documents and knowledge items.
      </div>

      <div className="mt-4">
        <input
          type="text"
          disabled
          placeholder="Ask about scope, risks, estimates, documents…"
          className="w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Additional Inputs
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Ad-hoc knowledge upload — coming in tasks 8.1–8.2.
        </p>
      </div>
    </Card>
  );
}
