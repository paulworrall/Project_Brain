import { getBriefCompleteness, type BriefCompleteness } from "@/lib/briefCompleteness";
import { formatKeyDetailsWithStatusForPrompt } from "@/lib/keyDetailsContext";
import { formatPmPerspectiveForPrompt, type PmPerspectiveValues } from "@/lib/pmPerspective";
import { getPmPerspectiveValues } from "@/lib/pmPerspectiveStore";
import { getVersionHistory, INITIAL_BRIEF_VERSION, type VersionEntry } from "@/lib/updateVersions";

/**
 * The one place an agent's view of a project is assembled: the original
 * brief (v1), every update in version order with its source, key details
 * with their status, and the PM perspective (labelled as the PM's view, not
 * the client's). Every agent that reasons about the project builds its
 * context from this, so all of them always see the latest update.
 *
 * Every query behind this (versions, key details, PM perspective) is scoped
 * by projectId at the database layer — CLAUDE.md: isolation is never
 * enforced by prompting alone.
 */
export interface ProjectContext {
  projectId: string;
  /** The brief and every update, oldest first (v1 = the brief). */
  versions: VersionEntry[];
  /** The newest version: 1 if there are no updates yet. */
  latestVersion: number;
  keyDetails: BriefCompleteness;
  pmPerspective: PmPerspectiveValues;
  /** Everything above, formatted for a prompt. */
  text: string;
}

export async function getProjectContext(projectId: string): Promise<ProjectContext> {
  const [versions, keyDetails, pmPerspective] = await Promise.all([
    getVersionHistory(projectId),
    getBriefCompleteness(projectId),
    getPmPerspectiveValues(projectId),
  ]);

  const latestVersion = Math.max(
    INITIAL_BRIEF_VERSION,
    ...versions.map((v) => v.versionNumber ?? INITIAL_BRIEF_VERSION)
  );

  return {
    projectId,
    versions,
    latestVersion,
    keyDetails,
    pmPerspective,
    text: formatProjectContext(versions, keyDetails, pmPerspective),
  };
}

function sourcePhrase(version: VersionEntry): string {
  return version.source === "INTERNAL_TEAM" ? "from our internal team" : "from the client";
}

export function formatProjectContext(
  versions: VersionEntry[],
  keyDetails: BriefCompleteness,
  pmPerspective: PmPerspectiveValues
): string {
  const [brief, ...updates] = versions;
  const sections: string[] = [];

  sections.push(`## Original brief (v1)\n${brief?.content.trim() || "(No brief text was captured.)"}`);

  if (updates.length > 0) {
    sections.push(
      [
        "## Updates since the brief, oldest first (where they differ, a later version supersedes an earlier one)",
        ...updates.map(
          (u) =>
            `### v${u.versionNumber ?? "?"} — ${u.label}, ${sourcePhrase(u)}\n${u.content.trim()}`
        ),
      ].join("\n\n")
    );
  }

  sections.push(`## Key details (current value, where it came from, and status)\n${formatKeyDetailsWithStatusForPrompt(keyDetails)}`);

  const pmBlock = formatPmPerspectiveForPrompt(pmPerspective);
  if (pmBlock) {
    sections.push(`## PM perspective (the PM's view, not the client's)\n${pmBlock}`);
  }

  return sections.join("\n\n");
}
