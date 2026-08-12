import Link from "next/link";
import { Card } from "@/components/ui/Card";

export interface ClientWorkstreamCardWorkstream {
  id: string;
  name: string;
  projectCount: number;
}

export interface ClientWorkstreamCardClient {
  id: string;
  name: string;
  workstreams: ClientWorkstreamCardWorkstream[];
}

/**
 * Hub page shortcut: surfaces a Client's Workstreams (name + project count)
 * directly in its card so a PM can jump straight to a Workstream's projects
 * without going through the intermediate Client detail page. That page
 * (/clients/[clientId]) still exists unchanged — this is additive, useful
 * for the common case of a handful of Workstreams; Clients with many are
 * still fully browsable via the Client name link below.
 */
export function ClientWorkstreamCard({ client }: { client: ClientWorkstreamCardClient }) {
  return (
    <Card className="p-4">
      <Link
        href={`/clients/${client.id}`}
        className="font-semibold text-foreground hover:underline"
      >
        {client.name}
      </Link>

      <ul className="mt-2 space-y-1">
        {client.workstreams.map((workstream) => (
          <li key={workstream.id}>
            <Link
              href={`/workstreams/${workstream.id}`}
              className="block rounded-md px-2 py-1 text-sm text-foreground hover:bg-surface-muted hover:underline"
            >
              {workstream.name} · {workstream.projectCount} project
              {workstream.projectCount === 1 ? "" : "s"}
            </Link>
          </li>
        ))}
        {client.workstreams.length === 0 && (
          <li className="px-2 py-1 text-sm text-muted-foreground">No workstreams yet</li>
        )}
      </ul>
    </Card>
  );
}
