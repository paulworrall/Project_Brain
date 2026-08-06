import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const workstreams = await prisma.workstream.findMany({
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    include: { client: true },
  });

  const options = workstreams.map((ws) => ({
    id: ws.id,
    label: `${ws.client.name} / ${ws.name}`,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">New Project</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste or upload the client brief — the Intake Agent will classify it and draft the
        Clarification Email, Position Document, and Set-Up Checklist.
      </p>

      <Card className="mt-6 p-6">
        <NewProjectForm workstreamOptions={options} />
      </Card>
    </div>
  );
}
