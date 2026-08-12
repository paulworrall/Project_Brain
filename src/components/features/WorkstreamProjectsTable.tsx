"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export interface WorkstreamProjectRow {
  id: string;
  name: string;
  currentStageNumber: number;
  stageName: string;
  jobCode: string | null;
  targetCompletionDate: Date | null;
  projectManagerName: string | null;
  updatedAt: Date;
}

type SortKey = "name" | "stage" | "pm" | "target" | "updated";
type SortDir = "asc" | "desc";

const NOT_SET = "—";

function formatDate(date: Date | null): string {
  if (!date) return NOT_SET;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date
  );
}

function compareRows(a: WorkstreamProjectRow, b: WorkstreamProjectRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "stage":
      return a.currentStageNumber - b.currentStageNumber;
    case "pm":
      return (a.projectManagerName ?? "").localeCompare(b.projectManagerName ?? "");
    case "target":
      return (a.targetCompletionDate?.getTime() ?? 0) - (b.targetCompletionDate?.getTime() ?? 0);
    case "updated":
      return a.updatedAt.getTime() - b.updatedAt.getTime();
  }
}

function SortButton({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
    >
      {label}
      {isActive && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

export function WorkstreamProjectsTable({
  projects,
  stageOptions,
}: {
  projects: WorkstreamProjectRow[];
  stageOptions: { number: number; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<number | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (stageFilter !== "all" && p.currentStageNumber !== stageFilter) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) || (p.jobCode ?? "").toLowerCase().includes(term)
      );
    });
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [projects, search, stageFilter, sortKey, sortDir]);

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects yet in this Workstream.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project name or job code…"
          aria-label="Search projects"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          aria-label="Filter by stage"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="all">All stages</option>
          {stageOptions.map((s) => (
            <option key={s.number} value={s.number}>
              Stage {s.number} — {s.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2">
                <SortButton label="Project" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-2">
                <SortButton label="Stage" sortKey="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-2">
                <SortButton label="PM" sortKey="pm" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-2">
                <SortButton
                  label="Target Completion"
                  sortKey="target"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-2">
                <SortButton
                  label="Last Updated"
                  sortKey="updated"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((project) => (
              <tr key={project.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="px-4 py-2.5">
                  <Link href={`/projects/${project.id}`} className="font-medium text-foreground hover:underline">
                    {project.name}
                  </Link>
                  {project.jobCode && (
                    <span className="ml-2 text-xs text-muted-foreground">{project.jobCode}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground">
                  Stage {project.currentStageNumber} — {project.stageName}
                </td>
                <td className="px-4 py-2.5 text-foreground">{project.projectManagerName ?? NOT_SET}</td>
                <td className="px-4 py-2.5 text-foreground">{formatDate(project.targetCompletionDate)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDate(project.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {visibleProjects.length === 0 && (
        <p className="text-sm text-muted-foreground">No projects match your search.</p>
      )}
    </div>
  );
}
