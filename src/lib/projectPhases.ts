/**
 * MAP's 5D Project Model — the five phases a project page is organised into.
 * Not to be confused with `phases.ts`, which groups Stages into the three
 * *Steps* inside Discover. Everything the app builds today lives in Discover;
 * the other four phases render a "coming soon" panel until their requirements
 * are written. Adding a phase later = flip `available`, add its content
 * component to the phase page, and give it a real `deriveStatus` rule.
 * Phase status is derived on read — nothing here is persisted.
 */
export type PhaseId = "discover" | "define" | "develop" | "deliver" | "dialogue";
export type PhaseStatus = "not_started" | "in_progress" | "complete";

/** What the status rules may look at. Plain data so it is shared by server and UI. */
export interface ProjectPhaseContext {
  /** The project has a client-approved SOW (FB-005). */
  hasClientApprovedSow: boolean;
}

export interface PhaseDefinition {
  id: PhaseId;
  order: number;
  label: string;
  verbs: [string, string];
  purpose: string;
  activities: string[];
  deliverable: string;
  exitGate: string;
  /** Design token name (see globals.css `--color-<token>`), never a raw hex. */
  accentToken: string;
  /** false → the phase page renders PhaseComingSoon. */
  available: boolean;
  deriveStatus: (project: ProjectPhaseContext) => PhaseStatus;
}

const notStarted = (): PhaseStatus => "not_started";

export const PROJECT_PHASES: readonly PhaseDefinition[] = [
  {
    id: "discover",
    order: 1,
    label: "Discover",
    verbs: ["Initiate", "Analyze"],
    purpose: "Establish what should be done and why, and agree it in a Statement of Work.",
    activities: ["Risk assessment", "Proof of concept", "Statement of work (plan, budget, scope)"],
    deliverable: "Statement of Work",
    exitGate: "We know what should be done and why.",
    accentToken: "phase-discover",
    available: true,
    // Projects always start in Discover, so it is never "not started".
    deriveStatus: (project) => (project.hasClientApprovedSow ? "complete" : "in_progress"),
  },
  {
    id: "define",
    order: 2,
    label: "Define",
    verbs: ["Ideate", "Specify"],
    purpose: "Work out how the solution should be done and capture it in specifications.",
    activities: [
      "CX specification",
      "Functional specification",
      "Technical specification",
      "Data specification",
      "Operational specification",
    ],
    deliverable: "A set of specifications",
    exitGate: "We know how it should be done.",
    accentToken: "phase-define",
    available: false,
    deriveStatus: notStarted,
  },
  {
    id: "develop",
    order: 3,
    label: "Develop",
    verbs: ["Build", "QA"],
    purpose: "Build the solution and make sure it is tested and ready for launch.",
    activities: [
      "Content creation",
      "Development",
      "Test and quality assurance",
      "Implementation",
      "Documentation",
    ],
    deliverable: "The finalised and quality-assured solution",
    exitGate: "Solution developed, tested and ready for launch.",
    accentToken: "phase-develop",
    available: false,
    deriveStatus: notStarted,
  },
  {
    id: "deliver",
    order: 4,
    label: "Deliver",
    verbs: ["Train", "Launch"],
    purpose: "Get the solution into the hands of its users and hand it over to operations.",
    activities: ["Training", "Internal launch", "External launch", "Hand-over to operations"],
    deliverable: "The solution delivered",
    exitGate: "Solution delivered.",
    accentToken: "phase-deliver",
    available: false,
    deriveStatus: notStarted,
  },
  {
    id: "dialogue",
    order: 5,
    label: "Dialogue",
    verbs: ["Analyze", "Optimize"],
    purpose: "Learn from how the solution performs and keep improving it.",
    activities: ["Evaluation", "Reporting", "Optimisation"],
    deliverable: "Insights extracted and evaluated",
    exitGate: "Solution analysed and optimised.",
    accentToken: "phase-dialogue",
    available: false,
    deriveStatus: notStarted,
  },
];

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function isPhaseId(value: string): value is PhaseId {
  return PROJECT_PHASES.some((p) => p.id === value);
}

export function getPhase(id: PhaseId): PhaseDefinition {
  const phase = PROJECT_PHASES.find((p) => p.id === id);
  if (!phase) throw new Error(`Unknown phase: ${id}`);
  return phase;
}

/** Every phase's status, derived from one context. Pure — safe on server and client. */
export function deriveProjectPhaseStatuses(project: ProjectPhaseContext): Record<PhaseId, PhaseStatus> {
  return Object.fromEntries(PROJECT_PHASES.map((p) => [p.id, p.deriveStatus(project)])) as Record<
    PhaseId,
    PhaseStatus
  >;
}

/** The first phase that isn't Complete (the last phase if all are). */
export function getCurrentPhaseId(statuses: Record<PhaseId, PhaseStatus>): PhaseId {
  return (PROJECT_PHASES.find((p) => statuses[p.id] !== "complete") ?? PROJECT_PHASES[PROJECT_PHASES.length - 1]).id;
}
