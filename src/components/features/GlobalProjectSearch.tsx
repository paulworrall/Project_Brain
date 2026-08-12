"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchProjectsAction, type ProjectSearchResult } from "@/app/(dashboard)/actions";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export function GlobalProjectSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const found = await searchProjectsAction(value);
        setResults(found);
        setIsOpen(true);
      });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <input
        type="search"
        aria-label="Search projects"
        placeholder="Search projects…"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => query.trim().length >= MIN_QUERY_LENGTH && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      />
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
          {isPending ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No projects found.</li>
          ) : (
            results.map((result) => (
              <li key={result.id}>
                <Link
                  href={`/projects/${result.id}`}
                  onMouseDown={() => setIsOpen(false)}
                  className="block px-3 py-2 hover:bg-surface-muted"
                >
                  <span className="block text-sm font-medium text-foreground">{result.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {result.clientName} / {result.workstreamName}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
