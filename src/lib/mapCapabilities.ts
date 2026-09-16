import type { Capability } from "@/generated/prisma/enums";

/**
 * The 12 MAP org capabilities, as reference content for both the assessment
 * agent's prompt and the capability multi-select's labels. Additive static
 * config, not a database table (same convention as src/lib/phases.ts) — the
 * fixed 12-value Capability enum in schema.prisma is the actual source of
 * truth for which capabilities can be selected; this just carries the
 * human-readable content around each one.
 *
 * `description`/`leads`/`videoSummary` are placeholders pending the real MAP
 * Capabilities Reference markdown — replace them when that content lands,
 * without needing to touch anything that reads MAP_CAPABILITIES.
 */
export interface MapCapability {
  id: Capability;
  label: string;
  description: string;
  leads: string[];
  videoSummary: string;
}

export const MAP_CAPABILITIES: MapCapability[] = [
  {
    id: "CLIENT_ENGAGEMENT_AND_DELIVERY",
    label: "Client Engagement & Delivery",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "CUSTOMER_AND_BUSINESS_STRATEGY",
    label: "Customer & Business Strategy",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "BUSINESS_ARCHITECTURE",
    label: "Business Architecture",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "AI_INNOVATION_AND_ENABLEMENT",
    label: "AI Innovation & Enablement",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "INSIGHTS_AND_OPTIMIZATION",
    label: "Insights & Optimization",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "EXPERIENCE_STRATEGY",
    label: "Experience Strategy",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "EXPERIENCE_DESIGN",
    label: "Experience Design",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "DATA_SOLUTION_CONSULTING",
    label: "Data Solution Consulting",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "TECH_SOLUTION_CONSULTING",
    label: "Tech Solution Consulting",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "TECH_AND_DATA",
    label: "Tech & Data",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "MEDIA_SOLUTION_CONSULTING",
    label: "Media Solution Consulting",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
  {
    id: "MARKETING_OPERATIONS",
    label: "Marketing Operations",
    description: "TODO: replace with the real MAP Capabilities Reference content.",
    leads: [],
    videoSummary: "",
  },
];

export function capabilityLabel(capability: Capability): string {
  return MAP_CAPABILITIES.find((c) => c.id === capability)?.label ?? capability;
}

/** Serialized for the assessment agent's prompt — name, description, leads, video summary per capability. */
export function formatCapabilitiesReferenceForPrompt(): string {
  return MAP_CAPABILITIES.map((c) => {
    const leads = c.leads.length > 0 ? c.leads.join(", ") : "Not specified";
    return `### ${c.label}\nDescription: ${c.description}\nLeads: ${leads}\nVideo summary: ${c.videoSummary || "Not specified"}`;
  }).join("\n\n");
}
