"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { ClarificationEmail, PositionDocumentFields } from "@/types/intake";
import { ClarificationEmailView } from "./ClarificationEmailView";
import { PositionDocumentView } from "./PositionDocumentView";
import { ChecklistView, type ChecklistItemView } from "./ChecklistView";

const TABS = [
  { key: "stage-tracker", label: "Stage Tracker" },
  { key: "outputs", label: "Outputs Library" },
  { key: "chatbot", label: "Chatbot" },
  { key: "knowledge", label: "Knowledge Upload" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface ProjectDetailTabsProps {
  clarificationEmail: ClarificationEmail | null;
  positionDocument: PositionDocumentFields | null;
  checklistItems: ChecklistItemView[];
}

export function ProjectDetailTabs({
  clarificationEmail,
  positionDocument,
  checklistItems,
}: ProjectDetailTabsProps) {
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

      <div role="tabpanel" className="mt-4">
        {activeTab === "stage-tracker" && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Stage Tracker — coming in task 7.1.</p>
          </Card>
        )}

        {activeTab === "outputs" && (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Clarification Email
              </h2>
              {clarificationEmail ? (
                <ClarificationEmailView email={clarificationEmail} />
              ) : (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Not generated yet.</p>
                </Card>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Project Position Document
              </h2>
              {positionDocument ? (
                <PositionDocumentView fields={positionDocument} />
              ) : (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Not generated yet.</p>
                </Card>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Set-Up Checklist
              </h2>
              <ChecklistView items={checklistItems} />
            </section>
          </div>
        )}

        {activeTab === "chatbot" && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              Project Brain Chatbot — coming in task 8.3-8.4.
            </p>
          </Card>
        )}

        {activeTab === "knowledge" && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              Knowledge Upload — coming in task 8.1-8.2.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
