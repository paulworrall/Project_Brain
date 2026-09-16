# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus post-MVP additions: a Phase-grouped Stage Tracker, full Client/Workstream taxonomy navigation + global search, Phase 1 as a progressively-disclosed fluid workspace (Foundation Details / Brief Readiness indicator, live Position Document, repeatable client-update log), commercial document management generalized into one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), and a Client-page "library" read-list UX for all three. **Newest**: an additive end-of-Phase-1 panel, "Capabilities & Estimate Brief" — a PM confirms which of 12 fixed MAP capability teams to approach for estimates (manually, or via AI-assisted suggestions) and generates a downloadable `.docx` brief for them, versioned like the commercial documents but without their revert mechanic. Phases 2-3 (Stages 5-9) still render as the original step-card list; Stage 8 hosts a real SOW-Template-selection panel. Stage 6/7/9/10 remain inert placeholders.

## File Inventory

### Source Files — Capabilities & Estimate Brief (new this session)
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | `Capability` enum (12 fixed MAP capabilities); `ProjectCapability` join table — the single live "confirmed capabilities" source of truth per Project, fully replaced on every save (not diffed); `EstimateBrief`/`EstimateBriefVersion` — mirrors the MSA-style document+version split (`fileBytes`, `fileName`, `versionNumber`) but has no `ENABLED`/`DISABLED`/revert mechanic; `capabilities: Capability[]` on the version is a frozen snapshot (plain Postgres enum array) used to detect staleness. Migration: `20260916122805_add_capabilities_and_estimate_brief` |
| `src/lib/mapCapabilities.ts` | Static reference content for the 12 capabilities (label/description/leads/videoSummary), same "plain TS constant" convention as `phases.ts`/`DEFAULT_SETUP_CHECKLIST_ITEMS`. **`description`/`leads`/`videoSummary` are still placeholders** — the real MAP Capabilities Reference markdown hasn't been supplied yet |
| `src/types/capabilities.ts` | `CapabilityEnum` (zod, from the Prisma enum), `CapabilitySuggestionSchema`/`CapabilityAssessmentSchema` (assessment agent's output shape, incl. `isLowConfidence`/`lowConfidenceReason`), `EstimateBriefContentSchema` (overview + per-capability sections) |
| `src/services/agents/capability-assessment-agent.ts` | `assessCapabilities(briefContext)` — one Claude call, matches captured brief content against the MAP reference; never invents a capability outside the fixed 12 |
| `src/services/agents/estimate-brief-agent.ts` | `generateEstimateBriefContent(briefContext, capabilities)` — one Claude call, returns structured JSON only; no `.docx` logic |
| `src/services/documents/estimate-brief-docx.ts` | `renderEstimateBriefDocx(content)` — pure, deterministic rendering of that JSON into a real `.docx` via the `docx` npm package (no AI call) |
| `src/lib/capabilitySuggestionProcessingStages.ts` | Stage labels/durations for the "Get suggestions" `ProcessingOverlay`, same pattern as `intakeProcessingStages.ts` |
| `src/components/features/CapabilitiesAndEstimateBriefPanel.tsx` | The panel itself — capability multi-select (local `checked` state, saved via its own action) + "Not sure? Get suggestions" (never writes to the DB; merges results into local state from inside the action function, not a `useEffect`, to avoid a `react-hooks/set-state-in-effect` cascading-render error) + "Prepare the estimate brief"/"Regenerate" + stale-brief banner (compares live confirmed set vs. the latest version's snapshot) |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | **+3 actions**: `suggestCapabilitiesAction` (read-only), `updateConfirmedCapabilitiesAction` (full replace), `generateEstimateBriefAction` (rejects at 0 confirmed capabilities; always adds a version). **+1 helper**: `assembleCapabilityBriefContext` (raw brief text + Position Document + Draft Scope Document + client updates, `projectId`-filtered, feeds both agents) |
| `src/app/api/projects/[projectId]/estimate-brief/[versionId]/route.ts` | **New — the first file-download route in the app.** Streams `fileBytes` with the correct OOXML content-type/`Content-Disposition`. No MSA/Rate Card/SOW Template version has an equivalent route despite all storing `fileBytes` too |
| `src/components/features/Phase1Workspace.tsx`, `ProjectWorkflow.tsx`, `.../[projectId]/page.tsx` | Threaded `confirmedCapabilities`/`estimateBriefVersion` props down; panel renders after the Clarification Email/Draft Scope Document grid — Phase 1's actual end of content (the Set-Up Checklist lives only in the sidebar, unchanged) |

### Source Files — Auth
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions |
| `src/proxy.ts` | Route protection (Next 16 `proxy.ts`) |
| `src/lib/permissions.ts` | `isClientEngagement(session)` — role check for commercial-document writes only; enforced server-side |

### Source Files — Dashboard shell, taxonomy & commercial documents
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/{page,layout}.tsx`, `clients/[clientId]/*`, `workstreams/[workstreamId]/*`, `projects/new/*` | Taxonomy browsing + project creation — unchanged this session |
| `master-service-agreements/page.tsx`, `rate-cards/page.tsx`, `sow-templates/*` | The three commercial-document libraries, each a per-Client `VersionHistory` list |
| `src/components/features/VersionHistory.tsx` | Shared version-history UI (current version + collapsed history + revert) — MSA/Rate Card/SOW Template only. Still has no download action for `fileBytes` |
| `src/components/features/{MasterServiceAgreementsPanel,RateCardsPanel,LibrarySummaryList,ClientMasterServiceAgreementSummary,ClientRateCardsSummary,ClientSowTemplatesSection,StartSowDevelopmentPanel}.tsx` | Commercial-document UI — unchanged this session |

### Source Files — Project workflow (the pipeline console)
| File | Purpose |
|------|---------|
| `src/components/features/{StageTracker,ClientUpdateComposer,ClarificationEmailCard,DraftScopeDocumentCard,EditableChecklist,PositionDocumentView,BriefReadinessIndicator,FoundationDetailsBlock,ChatPanel,KnowledgeUpload,SpecialistFeedbackForm,DocumentVersionContent,DeliverablesServicesDocumentView}.tsx` | Unchanged this session |
| `src/services/agents/{intake-agent,triage-agent,clarification-extraction,specialist-review-extraction,chatbot}.ts` | Unchanged this session |

### Configuration Files
`.gitignore`, `package.json` (`postinstall: prisma generate`; **+`docx` dependency**), `.claude/launch.json`, `eslint.config.mjs`, `vitest.config.mts` — otherwise unchanged.

### Test Files (49 files, 320 total, all passing)
This session's additions: `tests/services/{capability-assessment-agent,estimate-brief-agent,estimate-brief-docx}.test.ts`, `tests/components/CapabilitiesAndEstimateBriefPanel.test.tsx` (9), `tests/capabilities-and-estimate-brief.test.ts` (real-DB integration, mirrors `stage-1-5-happy-path.test.ts`'s convention). Updated `Phase1Workspace.test.tsx`/`ProjectWorkflow.test.tsx` for the two new required props. All other test files unchanged.

## Key Dependencies
`next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, **`docx` 9.7.1 (new — first `.docx`-generation dependency; chosen for being TS-native and producing real OOXML, not markdown/PDF relabelled)**, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored). Never `Read` `.env.local` as a whole file.

## Toolchain Notes (this machine)
- **DB-touching Prisma CLI commands require WSL** on this machine (unsigned native binary blocked by endpoint security) — `wsl bash -lc 'cd /mnt/c/Users/PaulWorrall/Documents/Project_Brain && npx prisma migrate dev --name <name>'`. The Prisma *Client* query path (`@prisma/adapter-pg`) is pure JS and works fine natively on Windows.
- **A standalone Node/tsx script using the app's cached `src/lib/prisma.ts` singleton intermittently failed with `ECONNREFUSED`** even with `DATABASE_URL` correctly loaded; constructing a fresh `PrismaClient({ adapter: new PrismaPg(...) })` directly (same pattern the integration tests use) connected fine. Vitest/Next's own dev server never hit this — only a bare one-off script did. Prefer that pattern for any future one-off DB script.
- **`useFallbackStageProgress`'s second argument must be a stable array reference** (its own docstring says so) — passing a freshly-spread copy every render retriggers its effect every render (tick → setState → re-render → new array → retrigger), an infinite loop the instant its consumer (e.g. `ProcessingOverlay`) actually activates. This reliably crashes/hangs the Vitest worker rather than failing a single test — if a new component test hangs specifically once user interaction opens an overlay, check this first.
- **`react-hooks/set-state-in-effect` (ESLint)**: calling `setState` synchronously inside a `useEffect` body (not inside a nested callback/timer) that only exists to react to an async action's pending→settled transition is flagged. Fix: do the state update inside the action function itself (wrap the bound Server Action, await it, `setState` on the result, return it) — not in an effect watching a `pending` ref.
- **A plain closure can't cross the Server→Client prop boundary** — only an actual Server Action (or `.bind()` of one) can; wrap in a small Client Component if you need to build the closure client-side.

## Current State Summary
All Level 1 MVP scope plus prior post-MVP additions remain complete and previously verified. **This session**: added the additive, non-gating "Capabilities & Estimate Brief" panel at the end of Phase 1 — confirmed-capabilities data model, two new agents, a new `.docx`-rendering utility and download route, three new Server Actions, and the panel UI itself, verified live against the real Neon DB and a real Claude API call (manual confirm → generate → downloaded a genuine Word doc with brief-grounded content; changed capabilities → staleness banner appeared; AI suggestions → 9 well-reasoned, correctly low-confidence-flagged matches). Test data created against the live seeded "Loyalty App Refresh" project during that verification was cleaned up afterward. Full suite (320 tests, up from 298), typecheck, lint, and production build are all clean. Not yet committed — pending user review.
