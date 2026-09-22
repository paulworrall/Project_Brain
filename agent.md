# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus a long tail of post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts` — 3 Phases over Stages 1-9, Stage 10 modeled separately as a continuous "Delivery Monitoring" indicator, not a completable Phase step), full Client/Workstream taxonomy navigation + global search, Phase 1 as a progressively-disclosed fluid workspace, commercial document management generalized into one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), a Client-page "library" read-list UX for all three, and an end-of-Phase-1 "Capabilities & Estimate Brief" panel (confirm MAP capability teams, generate a downloadable brief `.docx`). Phase 2 was simplified down to two subsections — "Capability inputs" (Stage 5) and "Build The Estimate" (Stage 6); Stage 7 ("Estimation Session") still exists as a Stage row but is deliberately excluded from the Phase 2 UI grouping. **Newest**: the full "Build The Estimate" feature — versioned Estimate tracks that match extracted roles against a client's rate card, with mandatory human confirmation on any role whose seniority level is ambiguous, deterministic pricing, and a downloadable estimate `.docx`. Phase 3 (Stages 8-9) still renders Stage 8's real SOW-Template-selection panel; Stage 9/10 remain inert placeholders.

## File Inventory

### Source Files — Build The Estimate (new this session)
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | New enums `RateType`, `EstimateInputSource`, `RoleMatchType`. New models: `RateCardLineItem` (structured role/level/rate rows, lazily parsed and cached per `RateCardVersion` — the rate card upload flow itself is untouched); `Estimate` (locked to one `rateCardVersionId` for its whole life, `onDelete: Restrict`); `EstimateCapabilityInput` (`capability: Capability?` nullable for "Other"; `@@unique([estimateId, capability])` is the upsert-by-capability mechanism); `RoleResolution` (`resolvedAt: DateTime?` is the pending/resolved signal itself — no separate status enum); `EstimateVersion` (immutable/append-only, no `status`/revert — matches `EstimateBrief`/`EstimateBriefVersion`, not the MSA/RateCard/SOWTemplate pattern); `EstimateLineItem` (never mutated after creation, audit-linked back to its `RoleResolution`/`RateCardLineItem`). **First use of Prisma `Decimal` fields in this schema.** Migrations: `20260922090757_add_build_estimate_models`, `20260922091901_estimate_capability_input_nullable_capability` |
| `src/lib/estimateMatchingConfig.ts` | `ROLE_MATCH_CONFIDENCE_THRESHOLD = 0.8` — the single named, tunable auto-resolve threshold |
| `src/lib/estimateMatching.ts` | `resolveMatchRouting(match, threshold)` — pure function; auto-resolve requires `matchType === "ROLE_AND_LEVEL"` **and** confidence ≥ threshold **and** a suggested line. A role-only match is structurally excluded regardless of confidence — verified live against the real Claude API (92%-confidence role-only suggestion still correctly held pending) |
| `src/services/pricing/estimate-pricing.ts` | `computeLineItemFee`, `computeEstimateTotals`, `buildEstimateDescription` — plain deterministic `Prisma.Decimal` arithmetic, never LLM output |
| `src/lib/estimateAnalysisProcessingStages.ts` | Stage labels/durations for the "Analyze & build" `ProcessingOverlay` |
| `src/lib/estimateContentDraft.ts` | `buildEstimateContentDraft(estimateId)` — shared line-item grouping/pricing assembly used by both the save action and the preview page, extracted to avoid duplicating the same ~60 lines twice |
| `src/types/estimates.ts` | Zod schemas: rate-card-line extraction, role extraction, role-match result, estimate document content |
| `src/services/agents/rate-card-line-item-agent.ts` | `parseRateCardLineItems(extractedText)` — one Claude call, reads the already-stored `RateCardVersion.extractedText` only, cache-guarded |
| `src/services/agents/estimate-role-extraction-agent.ts` | `extractRolesFromCapabilityInput(rawContent, capability)` — one Claude call |
| `src/services/agents/estimate-role-matching-agent.ts` | `matchRolesAgainstRateCard(extractedRoles, candidateLines)` — one Claude call, returns the raw match judgment only; `resolveMatchRouting` (above) decides auto-resolve, not the agent |
| `src/services/documents/estimate-document-docx.ts` | `renderEstimateDocumentDocx(content)` — same `docx` package/style as `estimate-brief-docx.ts`, adds a `Table` layout (overview block + one line-item table per capability with a running total) |
| `src/app/(dashboard)/projects/[projectId]/estimates/actions.ts` | New colocated actions file: `createEstimateAction`, `addOrReviseCapabilityInputAction` (revise deletes stale `RoleResolution` rows), `analyzeAndBuildEstimateAction` (idempotent per capability input), `resolveRoleResolutionAction`, `saveEstimateVersionAction` (server-side gate — refuses on any pending resolution or mixed currency, recomputes everything from scratch, writes `EstimateVersion`+`EstimateLineItem`s in one transaction, never overwrites) |
| `src/app/api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]/route.ts` | Download route, mirrors the estimate-brief download route one level deeper |
| `src/components/features/BuildEstimateInputForm.tsx` | Evolved in place — now requires `estimateId`/`existingInputs`, wired to `addOrReviseCapabilityInputAction`, shows an "already captured" state per capability |
| `src/components/features/EstimatesListPanel.tsx` | The real Stage 6 content — reverse-chronological Estimate tracks with expandable version history, "+ New estimate" (label + client-scoped rate-card picker) |
| `src/app/(dashboard)/projects/[projectId]/estimates/[estimateId]/page.tsx` | Own route (same reasoning as the Outputs Library split) — loads everything for one track, converts every `Decimal` to `Number` before passing to client components |
| `src/components/features/EstimateBuildWorkspace.tsx` | Composes capture → Analyze & build (`ProcessingOverlay`-wired) → `RoleResolutionReview` while anything's pending → `EstimateReviewCard` once fully resolved |
| `src/components/features/RoleResolutionReview.tsx` | Its own reviewable UI state, not folded into results — one row per pending role, suggested line clearly labeled "suggested, not applied," a dropdown of the locked rate card's real lines to confirm/override |
| `src/components/features/EstimateReviewCard.tsx` | Generate → review → Regenerate → download, matching `ClarificationEmailCard`/`DraftScopeDocumentCard`'s shape; no inline text editing |
| `src/components/features/ProjectWorkflow.tsx`, `.../[projectId]/page.tsx` | Wired last: `contentByStage[6]` now renders `EstimatesListPanel`; `page.tsx` gained an `estimates` query clause (same shape as the existing `estimateBrief` one) |

### Source Files — Capabilities & Estimate Brief (prior session)
| File | Purpose |
|------|---------|
| `src/lib/mapCapabilities.ts` | Static reference content for the 12 MAP capabilities. **`description`/`leads`/`videoSummary` are still placeholders** — real reference content not yet supplied |
| `src/types/capabilities.ts` | `CapabilityEnum`, `CapabilitySuggestionSchema`/`CapabilityAssessmentSchema`, `EstimateBriefContentSchema` |
| `src/services/agents/{capability-assessment-agent,estimate-brief-agent}.ts` | Capability suggestion + estimate-brief-content generation, one Claude call each |
| `src/services/documents/estimate-brief-docx.ts` | Deterministic `.docx` rendering, no AI call |
| `src/components/features/CapabilitiesAndEstimateBriefPanel.tsx` | Manual confirm + AI-assisted suggestions (never auto-writes) + generate/regenerate + staleness banner |
| `src/app/api/projects/[projectId]/estimate-brief/[versionId]/route.ts` | First file-download route in the app |

### Source Files — Auth
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions |
| `src/proxy.ts` | Route protection (Next 16 `proxy.ts`) |
| `src/lib/permissions.ts` | `isClientEngagement(session)` — role check for commercial-document writes only |

### Source Files — Dashboard shell, taxonomy & commercial documents
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/{page,layout}.tsx`, `clients/[clientId]/*`, `workstreams/[workstreamId]/*`, `projects/new/*` | Taxonomy browsing + project creation |
| `master-service-agreements/page.tsx`, `rate-cards/page.tsx`, `sow-templates/*` | The three commercial-document libraries, each a per-Client `VersionHistory` list |
| `src/components/features/VersionHistory.tsx` | Shared version-history UI (current version + collapsed history + revert) — MSA/Rate Card/SOW Template only |
| `src/components/features/{MasterServiceAgreementsPanel,RateCardsPanel,LibrarySummaryList,ClientMasterServiceAgreementSummary,ClientRateCardsSummary,ClientSowTemplatesSection,StartSowDevelopmentPanel}.tsx` | Commercial-document UI |

### Source Files — Project workflow (the pipeline console)
| File | Purpose |
|------|---------|
| `src/components/features/{StageTracker,ClientUpdateComposer,ClarificationEmailCard,DraftScopeDocumentCard,EditableChecklist,PositionDocumentView,BriefReadinessIndicator,FoundationDetailsBlock,ChatPanel,KnowledgeUpload,SpecialistFeedbackForm,DocumentVersionContent,DeliverablesServicesDocumentView}.tsx` | Unchanged this session |
| `src/services/agents/{intake-agent,triage-agent,clarification-extraction,specialist-review-extraction,chatbot}.ts` | Unchanged this session |

### Configuration Files
`.gitignore`, `package.json` (`postinstall: prisma generate`), `.claude/launch.json`, `eslint.config.mjs`, `vitest.config.mts` — unchanged this session. `npm audit` reports 0 vulnerabilities (an `overrides` entry pins `pdfjs-dist`, a transitive dep of `officeparser`, to a patched version).

### Test Files (56 files, 349 total, all passing)
This session's additions: `tests/estimate-matching.test.ts`, `tests/estimate-pricing.test.ts` (pure unit, no mocks), `tests/services/{rate-card-line-item-agent,estimate-role-extraction-agent,estimate-role-matching-agent,estimate-document-docx}.test.ts` (Anthropic-mocked), `tests/estimate-build.test.ts` (real-DB integration — track creation, add/revise input, role-only blocking, auto-resolve, idempotent re-analysis, resolve, save-refuses-while-pending, save-with-correct-pricing, append-only second save), `tests/estimate-download.test.ts`. Updated `tests/components/ProjectWorkflow.test.tsx` for the new `estimates`/`rateCardOptions` props and the new actions-module mock. All other test files unchanged.

## Key Dependencies
`next` 16.3.5, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, `docx` 9.7.1, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored). Never `Read` `.env.local` as a whole file.

## Toolchain Notes (this machine)
- **DB-touching Prisma CLI commands require WSL** on this machine (unsigned native binary blocked by endpoint security) — `wsl bash -lc 'cd /mnt/c/Users/PaulWorrall/Documents/Project_Brain && npx prisma migrate dev --name <name>'`. The Prisma *Client* query path (`@prisma/adapter-pg`) is pure JS and works fine natively on Windows. **After any WSL-side `npm install`, immediately run `npm install` again from native Windows** — the two platforms' optional-dependency native binaries do clobber each other, contrary to an earlier (wrong) assumption recorded in `progress.md`.
- **Prisma `Decimal` instances are not JSON-serializable across the Server→Client Component boundary.** Convert every `Decimal` to a `Number`/string in the Server Component before it's passed as a prop to a `"use client"` component; keep `Decimal` arithmetic entirely server-side.
- **A standalone Node/tsx script should build its own `PrismaClient({ adapter: new PrismaPg(...) })`** rather than importing the app's cached `src/lib/prisma.ts` singleton — the singleton intermittently failed with `ECONNREFUSED` in one-off scripts even with `DATABASE_URL` correctly loaded.
- **`useFallbackStageProgress`'s second argument must be a stable array reference** — a freshly-spread copy every render causes an infinite tick→setState→re-render loop that hangs the Vitest worker the instant its `ProcessingOverlay` consumer activates.
- **`react-hooks/set-state-in-effect` (ESLint)**: do state updates that react to an async action's pending→settled transition inside the action function itself, not inside a `useEffect` watching a `pending` ref.
- **serverExternalPackages**: `officeparser` must stay listed in `next.config.ts`'s `serverExternalPackages` — Turbopack's production bundling otherwise breaks its named export at runtime (a real deployed bug, fixed and verified via the build's file-trace manifest).

## Current State Summary
All Level 1 MVP scope plus every post-MVP addition (Stage Tracker, taxonomy nav, Phase 1 fluid workspace, commercial document libraries, Capabilities & Estimate Brief, Phase 2 simplification) remain complete and previously verified/deployed. **This session**: built the full "Build The Estimate" feature end-to-end — versioned Estimate tracks, capability-input capture, role extraction/matching against a client's rate card with a structurally-conservative human-confirmation gate on any ambiguous role, deterministic pricing, and a downloadable estimate `.docx` — verified live against the real Neon DB and real Claude API (a genuinely ambiguous "Developer, no level" role was correctly held pending at 92% confidence rather than auto-resolved; a fully-specified role auto-resolved correctly at 97%; saved pricing and the downloaded `.docx` were both confirmed correct). Test data created during that verification was cleaned up afterward. Full suite (349 tests, up from 320), typecheck, lint, and production build are all clean. **Not yet committed — pending user review.**
