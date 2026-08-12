import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";

export default async function TaxonomyBrowserPage() {
  const hubs = await prisma.hub.findMany({
    orderBy: { name: "asc" },
    include: {
      clients: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { workstreams: true } },
          workstreams: {
            select: { _count: { select: { projects: true } } },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">All Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse by Hub → Client → Workstream → Project, or search above.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          + New Project
        </Link>
      </div>

      {hubs.length === 0 && <p className="text-sm text-muted-foreground">No Hubs yet.</p>}

      {hubs.map((hub) => (
        <section key={hub.id} className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hub · {hub.name}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hub.clients.map((client) => {
              const projectCount = client.workstreams.reduce(
                (sum, ws) => sum + ws._count.projects,
                0
              );
              const workstreamCount = client._count.workstreams;

              return (
                <Link key={client.id} href={`/clients/${client.id}`} className="block">
                  <Card className="p-4 transition-colors hover:border-primary">
                    <h3 className="font-semibold text-foreground">{client.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {workstreamCount} workstream{workstreamCount === 1 ? "" : "s"} ·{" "}
                      {projectCount} project{projectCount === 1 ? "" : "s"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>

          {hub.clients.length === 0 && (
            <p className="text-sm text-muted-foreground">No Clients yet under this Hub.</p>
          )}
        </section>
      ))}
    </div>
  );
}
