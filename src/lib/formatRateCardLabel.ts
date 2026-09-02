/**
 * Shared "name (currency)" label used everywhere a Rate Card is displayed —
 * currency is optional (a rate card can carry several, one per role, within
 * a single file), so this omits the suffix entirely rather than rendering a
 * literal "(null)"/"(undefined)" when absent.
 *
 * Deliberately its own dependency-free module, not exported from
 * RateCardsPanel.tsx — that file also re-exports Server Actions
 * (uploadRateCardVersionAction etc., which transitively import @/lib/auth),
 * and several callers of this helper (NewProjectForm, ProjectSummaryBar)
 * have no other reason to pull that whole module graph in.
 */
export function formatRateCardLabel(name: string, currency: string | null): string {
  return currency ? `${name} (${currency})` : name;
}
