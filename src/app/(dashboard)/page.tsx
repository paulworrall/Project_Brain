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
          workstreams: {
            orderBy: { name: "asc" },
            include: {
              projects: {
                orderBy: { name: "asc" },
              },
            },
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
            Browse by Hub → Client → Workstream → Project.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          + New Project
        </Link>
      </div>

      {hubs.length === 0 && (
        <p className="text-sm text-muted-foreground">No Hubs yet.</p>
      )}

      {hubs.map((hub) => (
        <section key={hub.id} className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hub · {hub.name}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hub.clients.map((client) => (
              <Card key={client.id} className="p-4">
                <h3 className="font-semibold text-foreground">{client.name}</h3>

                <div className="mt-3 space-y-3">
                  {client.workstreams.map((workstream) => (
                    <div key={workstream.id}>
                      <p className="text-xs font-medium text-muted-foreground">
                        {workstream.name}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {workstream.projects.map((project) => (
                          <li key={project.id}>
                            <Link
                              href={`/projects/${project.id}`}
                              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
                            >
                              <span>{project.name}</span>
                              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                                Stage {project.currentStageNumber}
                              </span>
                            </Link>
                          </li>
                        ))}
                        {workstream.projects.length === 0 && (
                          <li className="px-2 py-1.5 text-sm text-muted-foreground">
                            No projects yet
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
