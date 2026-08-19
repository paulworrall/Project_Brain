import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export interface LibrarySummaryItem {
  id: string;
  name: string;
  /** Optional status tag shown in parentheses after the name, e.g. "baseline", "active", "current". */
  tag?: string;
  /** The current version's source filename, or null to show "Not yet uploaded". */
  fileName: string | null;
}

/**
 * Shared read-only "library" summary card — a section header, a
 * "Manage in library →" link out to the dedicated management page for that
 * document type, and a list of rows (name, optional status tag, filename).
 * Originally built for the SOW Templates section on the Client detail page;
 * reused as-is for Master Service Agreement and Rate Card summaries too,
 * rather than three near-identical hand-rolled lists. Full upload/revert
 * management always lives on the linked library page, never here — this
 * component only ever renders a read view (plus, optionally, a lightweight
 * quick-add form passed in as `children`, e.g. SOW's "Add variant").
 */
export function LibrarySummaryList({
  title,
  manageHref,
  items,
  emptyMessage,
  children,
}: {
  title: string;
  manageHref: string;
  items: LibrarySummaryItem[];
  emptyMessage: string;
  children?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Link
          href={manageHref}
          className="shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Manage in library →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <p className="font-medium text-foreground">
                {item.name}
                {item.tag && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">({item.tag})</span>
                )}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.fileName ?? "Not yet uploaded"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {children}
    </Card>
  );
}
