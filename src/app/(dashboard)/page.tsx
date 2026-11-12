import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { loadPipeline, type PipelineCard, type PipelineColumn } from "@/lib/pipeline";
import { formatMoney } from "@/lib/formatMoney";
import { NEEDS_REVIEW_TEXT } from "@/lib/estimateScopeSyncView";

/**
 * FB-009 F: the pipeline home page — every project grouped by its current
 * step: Brief · Estimate · SOW · Complete. Columns on desktop, sections on
 * narrow screens. No drag and drop: status is derived. Filters: My projects
 * (default) / All, and client — plain links and a GET form, so they work
 * without JavaScript and are shareable.
 */

const COLUMNS: { id: PipelineColumn; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "estimate", label: "Estimate" },
  { id: "sow", label: "SOW" },
  { id: "complete", label: "Complete" },
];

function days(n: number): string {
  return n === 0 ? "Today" : `${n} day${n === 1 ? "" : "s"} in step`;
}

function ProjectCard({ card }: { card: PipelineCard }) {
  return (
    <li className="border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{card.clientName}</p>
      <Link
        href={`/projects/${card.id}`}
        className="text-sm font-medium text-foreground hover:underline"
      >
        {card.name}
      </Link>
      {card.needsReview && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
          {NEEDS_REVIEW_TEXT}
        </p>
      )}
      <p className="mt-1 text-sm text-foreground">
        <span className="sr-only">Next action: </span>
        {card.nextAction}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <dt className="sr-only">PM</dt>
        <dd>{card.pmName ?? "No PM"}</dd>
        <dt className="sr-only">Time in step</dt>
        <dd className="text-right">{days(card.daysInStep)}</dd>
        {card.estimateTotal && (
          <>
            <dt className="sr-only">Estimate</dt>
            <dd className="col-span-2">
              {formatMoney(card.estimateTotal.amount, card.estimateTotal.currency)}
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; client?: string }>;
}) {
  const { view, client } = await searchParams;
  const session = await auth();
  const showAll = view === "all";
  const clientId = client || null;

  const [pipeline, clients] = await Promise.all([
    loadPipeline({ projectManagerId: showAll ? null : (session?.user?.id ?? null), clientId }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const total = COLUMNS.reduce((sum, c) => sum + pipeline.columns[c.id].length, 0);
  const query = (v: "mine" | "all") =>
    `/?${new URLSearchParams({ ...(v === "all" ? { view: "all" } : {}), ...(clientId ? { client: clientId } : {}) })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-light text-foreground sm:text-4xl">
            Pipeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every project, by the step it&apos;s in.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          + New Project
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <nav aria-label="Whose projects" className="flex border border-border-strong">
          {(["mine", "all"] as const).map((v) => {
            const active = (v === "all") === showAll;
            return (
              <Link
                key={v}
                href={query(v)}
                aria-current={active ? "page" : undefined}
                className={`min-h-11 px-4 py-2.5 text-sm ${
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-surface text-foreground hover:bg-line-soft"
                }`}
              >
                {v === "mine" ? "My projects" : "All"}
              </Link>
            );
          })}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2">
          {showAll && <input type="hidden" name="view" value="all" />}
          <label className="text-sm text-foreground">
            <span className="block text-xs font-medium">Client</span>
            <select
              name="client"
              defaultValue={clientId ?? ""}
              className="min-h-11 border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 border border-primary bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-line-soft"
          >
            Apply
          </button>
        </form>
      </div>

      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          {showAll ? "No projects match." : "You aren't PM on any projects yet. "}
          {!showAll && (
            <Link href={query("all")} className="font-medium text-primary hover:underline">
              Show all projects
            </Link>
          )}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const cards = pipeline.columns[column.id];
          return (
            <section
              key={column.id}
              aria-labelledby={`pipeline-${column.id}`}
              className="min-w-0 space-y-2"
            >
              <h2
                id={`pipeline-${column.id}`}
                className="flex items-baseline justify-between border-b border-navy pb-1"
              >
                <span className="text-sm font-medium tracking-wide text-foreground uppercase">
                  {column.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {cards.length}
                  <span className="sr-only"> project{cards.length === 1 ? "" : "s"}</span>
                </span>
              </h2>
              {cards.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-2">
                  {cards.map((card) => (
                    <ProjectCard key={card.id} card={card} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
