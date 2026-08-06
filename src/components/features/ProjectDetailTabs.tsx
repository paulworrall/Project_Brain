"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

const TABS = [
  { key: "stage-tracker", label: "Stage Tracker" },
  { key: "outputs", label: "Outputs Library" },
  { key: "chatbot", label: "Chatbot" },
  { key: "knowledge", label: "Knowledge Upload" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PLACEHOLDER_COPY: Record<TabKey, string> = {
  "stage-tracker": "Stage Tracker — coming in task 7.1.",
  outputs: "Outputs Library — coming in task 7.2.",
  chatbot: "Project Brain Chatbot — coming in task 8.3-8.4.",
  knowledge: "Knowledge Upload — coming in task 8.1-8.2.",
};

export function ProjectDetailTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>("stage-tracker");

  return (
    <div>
      <div role="tablist" aria-label="Project sections" className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card role="tabpanel" className="mt-4 p-6">
        <p className="text-sm text-muted-foreground">{PLACEHOLDER_COPY[activeTab]}</p>
      </Card>
    </div>
  );
}
