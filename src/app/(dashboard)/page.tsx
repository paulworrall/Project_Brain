import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ClientWorkstreamCard } from "@/components/features/ClientWorkstreamCard";

export default async function TaxonomyBrowserPage() {
  const hubs = await prisma.hub.findMany({
    orderBy: { name: "asc" },
    include: {
      clients: {
        orderBy: { name: "asc" },
        include: {
          workstreams: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, _count: { select: { projects: true } } },
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
            {hub.clients.map((client) => (
              <ClientWorkstreamCard
                key={client.id}
                client={{
                  id: client.id,
                  name: client.name,
                  workstreams: client.workstreams.map((workstream) => ({
                    id: workstream.id,
                    name: workstream.name,
                    projectCount: workstream._count.projects,
                  })),
                }}
              />
            ))}
          </div>

          {hub.clients.length === 0 && (
            <p className="text-sm text-muted-foreground">No Clients yet under this Hub.</p>
          )}
        </section>
      ))}
    </div>
  );
}
