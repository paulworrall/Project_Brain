# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), full Client/Workstream taxonomy navigation + global search, Phase 1 reworked into a progressively-disclosed fluid workspace, and — **newest** — commercial document management generalized into one shared "document has many Versions, exactly one current" pattern used identically by Master Service Agreements, Rate Cards, and a new SOW Template Library. Phases 2-3 (Stages 5-9) still render as the original step-card list; Stage 8 ("Commercials & SOW") now hosts a real SOW-Template-selection panel instead of a pure placeholder. Stage 6/7/9/10 remain inert placeholders. The Triage/Clarification agents and Document/DocumentVersion model are untouched.

## File Inventory

### Source Files — Auth
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions, `trustHost: true` |
| `src/proxy.ts` | Route protection (Next 16 `proxy.ts`) |
| `src/lib/permissions.ts` | `isClientEngagement(session)` — role check used by every commercial-document write action (MSA/Rate Card/SOW Template uploads, reverts, new-document creation); enforcement lives in the Server Action, not the UI. Selecting a Project's current Rate Card/SOW Template is **not** gated by this — that's a Project field write, open to both roles |

### Source Files — Dashboard shell & taxonomy
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Header + Sidebar + Footer shell |
| `src/app/(dashboard)/page.tsx` | Hub page (`/`) — Client cards via `ClientWorkstreamCard` |
| `src/app/(dashboard)/clients/[clientId]/page.tsx` + `actions.ts` | Client Detail — Workstreams; Contracts & Rates (MSA + Rate Card panels, now both built on the shared `VersionHistory` component); `ClientSowTemplatesSection` (read view: baseline + this Client's SOW Template variants, plus a quick "Add variant" action). `actions.ts` holds all MSA/Rate Card version actions — see below |
| `src/app/(dashboard)/sow-templates/page.tsx` + `actions.ts` | **New** — the SOW Templates library: the baseline GLOBAL template plus every client-specific variant grouped by Client, each as its own `VersionHistory` (via the `SOWTemplateVersionHistory` Client Component wrapper — see note below). `actions.ts`: `getSOWTemplatesForClientAction` (Client-scoped lookup — baseline + this Client's variants only, same isolation pattern as Rate Cards), `createClientSpecificSOWTemplateAction`, `uploadSOWTemplateVersionAction`, `revertSOWTemplateVersionAction` |
| `src/app/(dashboard)/workstreams/[workstreamId]/page.tsx` | Workstream Detail — feeds `WorkstreamProjectsTable` |
| `src/app/(dashboard)/projects/new/page.tsx` + `NewProjectForm.tsx` + `actions.ts` | Project creation. `getRateCardsForWorkstreamAction`/`createProjectAction`'s Rate Card validation now check `versions: { some: { status: "ENABLED" } }` instead of a `status` field on `RateCard` itself (moved to `RateCardVersion`) |
| `src/components/layout/Sidebar.tsx` | Nav: "All Projects", **new** "SOW Templates" (`/sow-templates`) |
| `src/components/features/{ClientWorkstreamCard,WorkstreamProjectsTable,GlobalProjectSearch}.tsx` | Taxonomy navigation — unchanged |

### Source Files — Commercial documents (shared versioning pattern)
| File | Purpose |
|------|---------|
| `src/components/features/VersionHistory.tsx` | **New** — the one reusable version-history UI, used identically by MSA, Rate Cards, and SOW Templates. Current version shown prominently; older (disabled) versions collapse behind a `<details>` "Version history (N)" toggle, each with a "Revert to this version" action (progressive disclosure, matching the Phase 1 work). Props: `versions`, `canManage`, `onUpload`, `makeRevertAction: (versionId) => action`, optional `children` for document-type-specific extra upload fields (MSA/Rate Card's effective-date range; SOW Templates need none) |
| `src/components/features/SOWTemplateVersionHistory.tsx` | **New** — thin Client Component wrapper around `VersionHistory` for use from the (Server Component) SOW Templates library page. **Required**: a plain closure like `(versionId) => action.bind(...)` cannot cross the Server→Client boundary as a prop (only an actual Server Action, or a direct `.bind()` of one, can) — building that closure inside a Client Component instead keeps it entirely client-side. `MasterServiceAgreementsPanel`/`RateCardsPanel`/`ClientSowTemplatesSection` don't need this wrapper since they're already Client Components |
| `src/components/features/MasterServiceAgreementsPanel.tsx` | Rewritten to a thin wrapper around one `VersionHistory` (an MSA is a single unnamed document per Client) |
| `src/components/features/RateCardsPanel.tsx` | Rewritten: one `VersionHistory` per named Rate Card document, plus a separate "Add rate card" create form (new document + first version — distinct from "upload a new version" to an existing one) |
| `src/components/features/ClientSowTemplatesSection.tsx` | **New** — read-only view on the Client detail page (baseline + this Client's variants, current version's filename only) plus a quick "Add [Client]-specific variant" create form. No upload/revert controls here — that's the library page's job, to avoid a second implementation |
| `src/components/features/StartSowDevelopmentPanel.tsx` | **New** — Stage 8's real content: a SOW Template `<select>` (scoped to baseline + the Project's own Client) + save button, wired to `startSowDevelopmentAction`. "Generate SOW" stays an explicit disabled placeholder — that agent doesn't exist yet |
| `src/lib/extractTextFromBuffer.ts` | **New** — the file-parse-and-wrap-errors helper, extracted out of `clients/[clientId]/actions.ts` once `sow-templates/actions.ts` needed the same logic |

### Source Files — Project workflow (the pipeline console)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Fetches Rate Cards via `versions: { some: { status: "ENABLED" } }` (not a `status` field on `RateCard` itself); fetches `sowTemplate` relation + Client-scoped `sowTemplateOptions`; passes both to `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | Phase 1 actions (`submitClientUpdateAction`, `generateDraftScopeDocumentAction`, `updateChecklistItemDetailAction`) unchanged this session. `updateProjectSummaryAction`'s Rate Card validation updated for the versioned shape. **New**: `startSowDevelopmentAction` — Project field write, no role check, re-validates the submitted template is the baseline or belongs to this Project's own Client |
| `src/components/features/ProjectWorkflow.tsx` | Stage 8's `contentByStage` entry is now `<StartSowDevelopmentPanel>` instead of the generic disabled placeholder; everything else (Phase 1 workspace, sidebar) unchanged |
| `src/components/features/{StageTracker,Phase1Workspace,ClientUpdateComposer,ClarificationEmailCard,DraftScopeDocumentCard,EditableChecklist,PositionDocumentView,ChecklistView}.tsx` | Unchanged this session — see prior checkpoint's notes for the progressive-disclosure redesign |
| `src/components/features/{ChatPanel,KnowledgeUpload,SpecialistFeedbackForm,DocumentVersionContent,ClarificationEmailView,DraftScopeDocumentView,DeliverablesServicesDocumentView,EditableOtherLabel}.tsx` | Unchanged |

### Source Files — Agents, parsing, data layer
| File | Purpose |
|------|---------|
| `src/services/agents/*.ts`, `src/services/parsing/index.ts` | Unchanged |
| `prisma/schema.prisma` | **Major change this session** — see below |
| `prisma/seed.ts` | Seeds one GLOBAL baseline `SOWTemplate` (`isBaseline: true`, idempotent via `findFirst`-then-`create` since there's no natural unique key to upsert on) |

### Schema (`prisma/schema.prisma`) — commercial documents generalized
- New shared `VersionStatus` enum (`ENABLED`/`DISABLED`) used by all three version tables.
- `MasterServiceAgreement` is now the "document" (`id`, `clientId` — `@@unique([clientId])`, since there's only ever one MSA per Client) with a new child `MasterServiceAgreementVersion` (file/dates/status/uploader/versionNumber).
- `RateCard` similarly split: the document keeps `id`/`clientId`/`name`/`currency`; a new `RateCardVersion` child holds the file/dates/status/uploader.
- New `SOWTemplate` (`id`, `name`, `scope: GLOBAL|CLIENT_SPECIFIC`, `clientId` nullable — null for GLOBAL, `isBaseline`) + `SOWTemplateVersion`.
- `Project.sowTemplateId` (nullable FK, `onDelete: SetNull`) — records a PM's SOW Template selection only; no generation agent consumes it yet.
- **Migration `20260818140000_generalize_commercial_documents` is hand-authored**, not machine-generated — Prisma's own diff would have dropped the columns being moved onto Version tables, losing data. It renames the old tables aside, builds the new shape, copies every old row forward (MSA rows consolidated per-Client into one document + N versions preserving history; Rate Card rows reuse their original id 1:1, so `Project.rateCardId` needed no rewrite), then drops the old tables. Applied via `prisma migrate deploy` (non-interactive — `migrate dev` refuses once it detects a data-loss-shaped diff in this environment).

### Configuration Files
Unchanged — see `.gitignore`, `package.json` (`postinstall: prisma generate`), `.claude/launch.json`, `eslint.config.mjs`, `vitest.config.mts`.

### Test Files (183 total, all passing)
This session's additions: `tests/commercial-documents-versioning.test.ts` (10, real-DB — DB-wide migration-integrity check that no document ever has >1 `ENABLED` version, upload/revert for MSA and Rate Cards, SOW Template Client-isolation, `startSowDevelopmentAction`). `tests/commercial-documents-permissions.test.ts` rewritten for the new action names/shapes plus SOW Template cases. New `tests/components/{VersionHistory,StartSowDevelopmentPanel,ClientSowTemplatesSection}.test.tsx`. `MasterServiceAgreementsPanel.test.tsx`/`RateCardsPanel.test.tsx` rewritten for the versioned props. `ProjectWorkflow.test.tsx` extended with `currentSowTemplate`/`sowTemplateOptions` in `baseProps`. All other test files unchanged from the prior session's 149.

## Key Dependencies
Unchanged: `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored) and Vercel Production. Never `Read` `.env.local` as a whole file — use `grep`/`sed` on specific lines.

## Deployment
Live URL: `https://project-brain-ten.vercel.app`. Vercel team `MAP` (scope `map25`), project `project-brain`, linked to `github.com/paulworrall/Project_Brain`'s `main` for continuous deployment. The prior progressive-disclosure session's commit was pushed and deployed; **this session's commercial-documents generalization is committed locally but not yet pushed** — pending user review. Redeploy manually: `npx vercel deploy --prod --scope map25`. Note: the migration in this commit has already been applied directly to the shared dev/prod Neon database (see Toolchain Notes) — pushing code doesn't re-run it, it's already live in the DB regardless of deploy state.

## Toolchain Notes (this machine)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64`; prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands require WSL** on this machine (unsigned native binary blocked by endpoint security): `wsl -d Ubuntu -- bash -c 'PATH="$HOME/node-portable/node-v24.19.0-linux-x64/bin:$PATH"; cd "/mnt/c/Users/PaulWorrall/Documents/Project_Brain" && npx prisma migrate dev --create-only --name <name>'`. **New this session**: when a migration would drop non-null data (a real schema restructure, not just an addition), `migrate dev` refuses to run at all in this non-interactive environment — use `--create-only` to scaffold, hand-edit the SQL for data preservation, then apply with `npx prisma migrate deploy` (non-interactive, no diff-prompting) instead of plain `migrate dev`.
- **After any `npm install` from WSL, immediately run `npm install` again from native Windows** — the two platforms' optional-dependency binaries don't reliably coexist.
- **Never run `next dev` and `next build` against the same `.next` directory concurrently** — corrupts `.next/dev/types/validator.ts`, causing `next build`'s typecheck to fail with syntax errors in that generated file. Stop any running dev server first; if it's already corrupted, delete `.next` entirely before rebuilding.
- **A plain closure can't cross the Server→Client prop boundary** — only an actual Server Action (or a direct `.bind()` of one) can. `<ClientComponent someProp={(x) => serverAction.bind(null, x)} />` from a Server Component throws at render time ("Functions cannot be passed directly to Client Components..."), not at build/typecheck time. Fix: wrap in a small Client Component that builds the closure internally.
- **jest-dom's `.toBeVisible()` vs `.toBeInTheDocument()`**: a native `<details>`'s children stay mounted even when collapsed — asserting hidden content requires `.not.toBeVisible()`, not `.not.toBeInTheDocument()`.
- **A required `<input type="file">` can block jsdom form submission** even after `userEvent.upload()` — `fireEvent.submit(form)` (bypasses the constraint-validation gate a real click goes through) is a reliable workaround in tests; don't remove `required` from real product code to work around it.

## Current State Summary
All Level 1 MVP scope plus prior post-MVP additions (Phase Presentation Layer, taxonomy navigation, Phase 1's progressive-disclosure workspace) remain complete and previously verified. **This session**: commercial document management generalized across the platform. MSA and Rate Cards were migrated (no data loss — verified against real pre-existing Client data) from simple ACTIVE/SUPERSEDED or ACTIVE/ARCHIVED flags into a shared "document has many Versions, exactly one current" pattern, with a new reusable `VersionHistory` UI component used identically by both plus a brand-new SOW Template Library (one seeded GLOBAL baseline + Client-specific variants). Uploading a new version always disables the previous current one; reverting re-enables an old version and disables the current one; nothing is ever deleted; disabled versions stay visible in an admin history view but are never offered to PMs. Write access (new documents, uploads, reverts) stays ClientEngagement-only, enforced server-side exactly like the existing MSA/Rate Card boundary; selecting a Project's current Rate Card or SOW Template remains open to both roles, since that's a Project field write, not a document write. A new Stage 8 panel lets a PM record which SOW Template a Project will use (baseline or their own Client's variant only — isolation verified live in the browser, not just in tests), with the actual generation agent left as an explicit future placeholder. Two real bugs were caught via live browser verification rather than assumed fixed from tests alone: a Server→Client prop-boundary violation on the new SOW Templates library page (fixed with a small Client Component wrapper), and a stale `.next` directory from a concurrently-running dev server corrupting the production build (fixed by clearing it). Full suite (183 tests, up from 149), typecheck, lint, and production build are all clean. This checkpoint's commit is local-only — do not push until the user explicitly reviews and approves.
