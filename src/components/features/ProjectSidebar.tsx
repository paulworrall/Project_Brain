"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Card } from "@/components/ui/Card";
import { AddProjectInformationPanel } from "./AddProjectInformationPanel";
import { ProjectAssistant } from "./ProjectAssistant";
import type { VersionView } from "./VersionHistoryDrawer";

/**
 * The project sidebar (FB-012): one panel with two tabs — "Ask" (the Project
 * assistant, the default) and "Add notes or files" (FB-010's form). Step-independent:
 * the project layout renders one instance and it stays mounted across step
 * switches (and inside the narrow-screen drawer), so drafts survive; both tab
 * panels stay mounted and the inactive one is hidden. Accessible tabs: a
 * tablist, roving tabindex, arrow-key / Home / End navigation, aria-selected.
 * A complete project has only the Ask tab (nothing can be added any more).
 */
const TABS = [
  { id: "ask", label: "Ask" },
  { id: "add", label: "Add notes or files" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ProjectSidebar({
  projectId,
  projectName,
  versions,
  projectComplete = false,
}: {
  projectId: string;
  projectName: string;
  versions: VersionView[];
  projectComplete?: boolean;
}) {
  const [active, setActive] = useState<TabId>("ask");
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  if (projectComplete) {
    return (
      <Card variant="feature" className="p-4">
        <h2 className="text-card font-medium text-foreground">Ask</h2>
        <div className="mt-3">
          <ProjectAssistant projectId={projectId} projectName={projectName} embedded />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="feature" className="p-4">
      <div role="tablist" aria-label="Project assistant" onKeyDown={onKeyDown} className="flex border-b border-border">
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={`-mb-px min-h-11 flex-1 cursor-pointer border-b-[3px] px-3 py-2 text-sm font-medium focus-inset ${
                selected
                  ? "border-orange text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-ask`}
        aria-labelledby={`${baseId}-tab-ask`}
        hidden={active !== "ask"}
        className="pt-4"
      >
        <ProjectAssistant projectId={projectId} projectName={projectName} embedded />
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-add`}
        aria-labelledby={`${baseId}-tab-add`}
        hidden={active !== "add"}
        className="pt-1"
      >
        <AddProjectInformationPanel projectId={projectId} versions={versions} embedded />
      </div>
    </Card>
  );
}
