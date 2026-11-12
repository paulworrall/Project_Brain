import type { ScopeViewSection } from "@/lib/scopeSummaryView";

/**
 * The Scope summary's sections, read-only. Key details shown in a section are
 * marked "Key detail" in words (they're edited under What We Need to Find
 * Out, not here). Used by the Brief step's card and by the Outputs Library /
 * version history.
 */
export function ScopeSummarySections({
  sections,
  headingLevel = 4,
}: {
  sections: ScopeViewSection[];
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {sections.map((section) => (
        <div key={section.id} className={section.id === "context" ? "sm:col-span-2" : undefined}>
          <dt>
            <Heading className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </Heading>
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {section.items.length === 0 ? (
              <span className="text-muted-foreground">Nothing yet.</span>
            ) : section.id === "context" && section.items.length === 1 ? (
              <p className="whitespace-pre-wrap">{section.items[0].text}</p>
            ) : (
              <ul className="list-disc space-y-0.5 pl-5">
                {section.items.map((item, i) => (
                  <li key={i}>
                    {item.text}
                    {item.source === "key_detail" && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(Key detail)</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
