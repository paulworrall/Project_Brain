// Pure staleness logic (no database) — safe to import from client components.
// The database side is src/lib/outputFreshness.ts.

// The brief is v1; mirrors INITIAL_BRIEF_VERSION in src/lib/updateVersions.ts,
// which can't be imported here as it reads the database.
const INITIAL_BRIEF_VERSION = 1;

/**
 * Whether a generated output still reflects the project. An output is stale
 * when, after it was built, any of these happened: a new update (a version
 * newer than the one it was built from), a PM perspective edit, or a key
 * detail change. Key details read from a version the output already
 * includes don't count (an update refreshes the Position Document, then its
 * own key details are saved a moment later). Staleness is only ever a flag:
 * nothing is regenerated without the PM asking.
 */
export interface Freshness {
  /** The brief version the output was built from (1 = the brief). */
  builtFromVersion: number;
  latestVersion: number;
  stale: boolean;
  /** Plain-English reasons, e.g. "New updates: v3, v4", "PM perspective edited". */
  reasons: string[];
}

export interface OutputFreshness extends Freshness {
  /** False for outputs that come from human input (estimates, specialist review): flag only. */
  canRegenerate: boolean;
}

export interface FreshnessChanges {
  updates: { versionNumber: number; uploadedAt: Date }[];
  pmEdits: Date[];
  /** fromVersion: the version the value was read from (1 = the brief); null for a PM's own edit. */
  keyDetailChanges: { createdAt: Date; fromVersion: number | null }[];
}

export function evaluateFreshness(
  built: { builtFromVersion: number | null; builtAt: Date },
  changes: FreshnessChanges
): Freshness {
  // Outputs made before the version was recorded: whatever existed then.
  const builtFromVersion =
    built.builtFromVersion ??
    Math.max(
      INITIAL_BRIEF_VERSION,
      ...changes.updates.filter((u) => u.uploadedAt <= built.builtAt).map((u) => u.versionNumber)
    );
  const latestVersion = Math.max(INITIAL_BRIEF_VERSION, ...changes.updates.map((u) => u.versionNumber));

  const reasons: string[] = [];
  const newer = changes.updates
    .map((u) => u.versionNumber)
    .filter((v) => v > builtFromVersion)
    .sort((a, b) => a - b);
  if (newer.length > 0) {
    reasons.push(`New update${newer.length === 1 ? "" : "s"}: ${newer.map((v) => `v${v}`).join(", ")}`);
  }
  if (changes.pmEdits.some((editedAt) => editedAt > built.builtAt)) {
    reasons.push("PM perspective edited");
  }
  if (
    changes.keyDetailChanges.some(
      (c) => c.createdAt > built.builtAt && (c.fromVersion === null || c.fromVersion > builtFromVersion)
    )
  ) {
    reasons.push("Key details changed");
  }

  return { builtFromVersion, latestVersion, stale: reasons.length > 0, reasons };
}

/** "Built from v2 — v4 is available", or what changed when there's no newer version. */
export function staleHeadline(freshness: Freshness): string {
  const built = `Built from v${freshness.builtFromVersion}`;
  if (freshness.latestVersion > freshness.builtFromVersion) {
    return `${built} — v${freshness.latestVersion} is available`;
  }
  const pmEdited = freshness.reasons.includes("PM perspective edited");
  const keyDetailsChanged = freshness.reasons.includes("Key details changed");
  if (pmEdited && keyDetailsChanged) return `${built} — the PM perspective and key details have changed since`;
  if (pmEdited) return `${built} — the PM perspective has changed since`;
  if (keyDetailsChanged) return `${built} — key details have changed since`;
  return built;
}

