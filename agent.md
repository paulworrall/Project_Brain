# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus a long tail of post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), full Client/Workstream taxonomy navigation + global search, Phase 1 as a progressively-disclosed fluid workspace, commercial document management generalized into one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), an end-of-Phase-1 "Capabilities & Estimate Brief" panel, the full "Build The Estimate" feature (Stage 6, through two build passes — the original build, then a substantial redesign driven by hands-on testing), and now a real "Generate SOW" feature (Stage 8, **this session**) replacing what had been a disabled stub since the app's first build.

**Build The Estimate, current shape**: a PM opens "+ New estimate" (a modal that runs the *entire* build flow — create, add roles, review, save, download — without navigating to a page) or the estimate's own standalone page. Adding a role is one step: paste/upload, submit, extraction+matching run automatically. Each role's capability is AI-classified, not human-picked. The review grid is one flat table (capability as a column) with inline quantity editing. Word + Excel downloads for the latest version show at the top.

**Generate SOW, current shape (new this session)**: Stage 8's numbered "Step 3.1/3.2" badges are gone (both Phase 3 steps now render like Phase 2's plain-name style). A PM picks a SOW Template, clicks "Generate SOW" — no other steps — and the app assembles everything already captured about the project (Position/Draft Scope/Deliverables & Services Documents, confirmed capabilities, the latest saved Estimate's pricing, project summary fields, client/contact details) into a real, AI-drafted `.docx`, guided by (not mail-merged from) the selected template's own structure/tone. Regenerating always appends a new version — mirrors Build The Estimate's non-destructive versioning, with a "Download a past version (N)" disclosure for history.

## File Inventory

### Source Files — Generate SOW (new this session)
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | New `SOW`/`SOWVersion` models, mirroring `EstimateBrief`/`EstimateBriefVersion` exactly (one SOW per project, `projectId @unique`, append-only versions) — plus each version **snapshots** `sowTemplateId`/`sowTemplateVersionId` (nullable, `SetNull`), since a PM can change the project's live template selection independently of regenerating. Migration `20260922165449_add_sow_and_sow_version`, purely additive |
| `src/types/sow.ts` | `SOWDocumentContentSchema` (agent-authored narrative: scope, deliverables, services — reuses `DeliverablesServicesDocument`'s exact 6-key shape verbatim, never remapped to the 12-value `Capability` enum — milestones, roles, assumptions, and AI-synthesized `outOfScope`/`risks`) kept deliberately separate from `SowCoverDetails` (plain TS interface: client name, job code, dates, contact, commercials — **never agent-authored**, same "never invent a fact that could reach a client" discipline as `EstimateDocumentContentSchema.overview`) |
| `src/lib/sow-context.ts` | `assembleSowContext(projectId)` — the narrative-assembly precedent (`assembleCapabilityBriefContext`) extended to also pull the Deliverables & Services Document, confirmed capabilities, and the project's latest saved `EstimateVersion` (found via `estimate: { projectId }` since a project can have several `Estimate` tracks), none of which the existing narrower assembler covered |
| `src/services/agents/sow-agent.ts` | `generateSowContent(narrativeContext, templateStructureGuidance)` — one Claude call; the template's `extractedText` is explicitly scoped in the prompt to structure/tone guidance only, never a source of facts about the project |
| `src/services/documents/sow-docx.ts` | `renderSowDocx({coverDetails, body})` — pure rendering, mirrors `estimate-brief-docx.ts` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | New `generateSowAction` — kept deliberately separate from `startSowDevelopmentAction` (template selection stays a cheap, standalone, no-AI-call action) |
| `src/app/api/projects/[projectId]/sow/[versionId]/route.ts` | Download route, session-gated from the start |
| `src/components/features/StartSowDevelopmentPanel.tsx` | Simplified: same template/version form, then a real "Generate SOW"/"Regenerate SOW" button (self-contained `ProcessingOverlay`) + latest-version download + `EstimatesListPanel`-style version-history disclosure, replacing the old disabled stub |
| `src/components/features/StageTracker.tsx` | One-line fix: `hideStepNumbers` now also applies to `phase.key === "sow"`, dropping the "Step 3.1/3.2 —" badges/prefixes for the whole Phase 3 section |

### Source Files — Build The Estimate (prior sessions)
| File | Purpose |
|------|---------|
| `src/lib/estimateMatching.ts`, `estimateMatchingConfig.ts` | Conservative role-only-never-auto-resolves matching gate |
| `src/services/pricing/estimate-pricing.ts` | Deterministic `Prisma.Decimal` pricing, never LLM output |
| `src/services/agents/{rate-card-line-item-agent,estimate-role-extraction-agent,estimate-role-matching-agent}.ts` | Capability now classified per-role by the extraction agent itself |
| `src/services/documents/{estimate-document-docx,estimate-document-xlsx}.ts` | Word + Excel exports from the same structured content |
| `src/components/features/{BuildEstimateInputForm,EstimateBuildWorkspace,EstimateReviewCard,RoleResolutionReview,EstimatesListPanel}.tsx` | Add-role-and-auto-analyze flow, flat editable review grid |
| `src/components/ui/Modal.tsx` | Generic reusable modal — used by both Estimates' "New estimate" flow and, non-embedded, `BuildEstimateInputForm` |

### Source Files — Capabilities & Estimate Brief, Auth, taxonomy, commercial documents, project workflow
Unchanged this session — see `progress.md` for detail. `src/lib/{auth,permissions}.ts`, `src/proxy.ts`; taxonomy pages; `master-service-agreements/rate-cards/sow-templates` libraries + `VersionHistory.tsx`; `CapabilitiesAndEstimateBriefPanel.tsx`; `src/services/agents/{intake-agent,triage-agent,clarification-extraction,specialist-review-extraction,chatbot}.ts`.

### Configuration Files
`.gitignore`, `package.json` (`postinstall: prisma generate`, `exceljs` + `uuid` override from the Estimates redesign), `.claude/launch.json`, `eslint.config.mjs`, `vitest.config.mts`. `npm audit` reports 0 vulnerabilities.

### Test Files (68 files, 379 total, all passing)
This session: `tests/services/{sow-agent,sow-docx}.test.ts`, `tests/sow-context.test.ts` (real-DB, covers full/degraded/never-invents-a-contact cases), `tests/sow-download.test.ts` (incl. 401), `tests/sow-generation.test.ts` (real-DB — proves regenerating appends v2 without touching v1, and each version's snapshotted template reflects what was selected *at that generation*, not the live selection). `tests/components/StartSowDevelopmentPanel.test.tsx` rewritten (the old "Generate SOW renders disabled" test is now false — replaced with real-behavior coverage). `tests/components/StageTracker.test.tsx` updated for the new no-numbering-in-Phase-3 reality.

## Key Dependencies
`next` 16.3.5, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, `docx` 9.7.1, `exceljs`, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored). Never `Read` `.env.local` as a whole file.

## Toolchain Notes (this machine)
- **DB-touching Prisma CLI commands require WSL.** `prisma migrate dev --create-only` refuses non-interactively for any migration Prisma flags unsafe (e.g. a required column on a table with existing rows) — for a staged migration, hand-write the migration folder + SQL directly. After any WSL-side `npm install`, immediately run `npm install` again from native Windows.
- **This is a shared dev DB with real user-created data** — a migration this session hit real `RoleResolution` rows from the user's own manual testing; always check row counts before writing a migration that touches an existing table, not just before running it.
- **Prisma `Decimal` instances aren't JSON-serializable across the Server→Client boundary** — convert to `Number`/string server-side first.
- **`useFallbackStageProgress`'s stage-durations array must be a stable module-level reference**, not a fresh copy per render.
- **`react-hooks/set-state-in-effect` (ESLint)**: do state updates that react to an action's pending→settled transition inside the action function itself, not a `useEffect` watching `pending`.
- **serverExternalPackages**: `officeparser` must stay listed in `next.config.ts`.
- **Check a new dependency's transitive deps with `npm audit` immediately** — `exceljs` pinned a `uuid` with a moderate CVE, fixed via a `package.json` override rather than downgrading the package (same pattern as the earlier `pdfjs-dist` fix).
- **API download routes need their own session check** — `src/proxy.ts`'s matcher excludes `/api/*` from the app-wide auth redirect. The estimate-version and estimate-brief download routes were missing this for a while (fixed); every new download route (the SOW one included) must have it from the start.

## Current State Summary
All Level 1 MVP scope plus every prior post-MVP addition remain complete and previously verified/deployed. **This session**: replaced Stage 8's disabled "Generate SOW" stub with a real feature — AI-drafted SOW content assembled from everything already captured about a project, guided by (not mail-merged from) the selected template, with non-destructive versioning and the Phase 3 step-number badges removed. Verified live against the real Claude API and Neon DB on a genuinely realistic project (real SOW template text, real Position/Draft Scope/Deliverables documents): the generated content correctly grounded every fact in real project data, correctly flagged an unconfirmed contact email as an open item rather than inventing one, regenerating correctly appended v2 while v1 stayed independently downloadable and unchanged, and the project's pre-existing template selection was left untouched by the whole test pass. Full suite (379 tests, up from 359), typecheck, lint, and production build all clean. **Not yet committed — pending user review.**
