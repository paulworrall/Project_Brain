# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus several post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), full Client/Workstream taxonomy navigation + global search, Client-level commercial documents (MSAs/Rate Cards) with the app's first real role enforcement, and Phase 1 reworked twice this cycle: first from a 4-step gated sequence into a fluid workspace (`Phase1Workspace.tsx`), then — **newest** — that workspace was itself redesigned for progressive disclosure after it shipped too long with a real checklist-duplication bug. Phases 2-3 (Stages 5-9) still render as the original step-card list; only Phase 1's presentation changed — the underlying Document/DocumentVersion/Stage models and the Triage/Clarification agents themselves are untouched. Stage 6 is unlocked but not built; Stages 7-10 are inert placeholders.

## File Inventory

### Source Files — Auth
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions, `trustHost: true` |
| `src/proxy.ts` | Route protection (Next 16 `proxy.ts`) |
| `src/types/next-auth.d.ts` | Session/JWT type augmentation (`role`/`id`) |
| `src/app/(auth)/{login,signup}/*` | Login/signup screens + Server Actions |
| `src/lib/permissions.ts` | `isClientEngagement(session)` — role check used by every commercial-document write action; enforcement lives in the Server Action, not the UI |

### Source Files — Dashboard shell & taxonomy
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Header + Sidebar + Footer shell |
| `src/app/(dashboard)/page.tsx` | Hub page (`/`) — Client cards via `ClientWorkstreamCard`, workstream/project counts |
| `src/app/(dashboard)/clients/[clientId]/page.tsx` + `actions.ts` | Client Detail — Workstreams, Contracts & Rates (MSA/Rate Card panels, role-checked write actions) |
| `src/app/(dashboard)/workstreams/[workstreamId]/page.tsx` | Workstream Detail — feeds `WorkstreamProjectsTable` (client-side sort/filter) |
| `src/app/(dashboard)/actions.ts` | `searchProjectsAction` — debounced global project search, 2-char minimum |
| `src/app/(dashboard)/projects/new/page.tsx` + `NewProjectForm.tsx` + `actions.ts` | Project creation: brief upload/paste, Client-scoped Rate Card select, runs the full Intake Agent. `createProjectAction` marks Stage 1 **and** Stage 2 `COMPLETE` at creation (the Clarification Email is generated as part of Intake, not its own pipeline step) and opens Stage 3 `IN_PROGRESS`; `currentStageNumber` starts at 3 |
| `src/components/layout/{Header,Sidebar,Footer}.tsx` | Header renders `GlobalProjectSearch` inline |
| `src/components/features/{ClientWorkstreamCard,WorkstreamProjectsTable,GlobalProjectSearch}.tsx` | Taxonomy navigation components — plain pre-mapped props, no raw Prisma types |
| `src/components/features/{MasterServiceAgreementsPanel,RateCardsPanel}.tsx` | Client-level commercial document list+form panels, role-gated (UX nicety only — see `permissions.ts`) |
| `src/app/(dashboard)/projects/[projectId]/outputs/page.tsx` + `outputs/[documentType]/page.tsx` | Outputs Library + Version History — **the single canonical place full document content renders**. `outputs/[documentType]` already supported linking directly to one document type before this session; Phase 1's new compact cards link here instead of duplicating full-content rendering |

### Source Files — Project workflow (the pipeline console)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — fetches Documents/ChecklistItems/all `TouchpointNote`s (mapped to a full `clientUpdates` log, newest-first)/KnowledgeItems/Stages; passes everything to `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | **Phase 1 actions, repeatable**: `submitClientUpdateAction` — runs clarification extraction, adds a Position Document version + `TouchpointNote`; callable any number of times, never touches `ProjectStageStatus`. `generateDraftScopeDocumentAction` — on first run transitions Stage 3/4→`COMPLETE`, Stage 5→`IN_PROGRESS` (upserts, not updates — a real bug was caught here, see Current State Summary below); on later runs just appends a new `DocumentVersion`. `updateChecklistItemDetailAction` — persists `ChecklistItem.detailText` independently of `isComplete`. Unchanged: `submitSpecialistFeedbackAction`, `toggleChecklistItemAction`, `updateOtherServiceLabelAction`, `uploadKnowledgeItemAction`, `askChatbotAction`, `updateProjectSummaryAction` |
| `src/components/features/StageTracker.tsx` | Renders 3 Phase `<details>` cards. Phase 1 takes explicit `phase1Status: "NOT_STARTED"\|"IN_PROGRESS"\|"READY_FOR_SPECIALIST_REVIEW"` + `phase1Content: ReactNode` props instead of deriving its badge/content from `steps` the way Phase 2/3 still do — badge reads "Not started"/"In progress"/"Ready for specialist review" instead of "x/4 stages". `READY_FOR_SPECIALIST_REVIEW` is a status flag only; the real Phase 1→2 handoff UX is deferred to when Phase 2 is reviewed next |
| `src/components/features/Phase1Workspace.tsx` | Phase 1's workspace, **redesigned this session for progressive disclosure**: a compact progress-summary strip ("X confirmed details · Y open questions · Z client updates logged · N/M checklist items complete", computed live — no hardcoded denominator) at the top; live Position Document (`PositionDocumentView`) under "Current position"; `ClientUpdateComposer`; `ClarificationEmailCard` + `DraftScopeDocumentCard` side by side. **No longer renders `EditableChecklist`** — that was a real duplication bug (the sidebar already renders it), now fixed by removing this copy entirely |
| `src/components/features/ClientUpdateComposer.tsx` | "Add a client update" textarea bound to `submitClientUpdateAction`, keyed on the log's length so a successful submit remounts/clears the form. **"Previous updates" now shows only the single most recent entry by default**, with a `<details>` "View all updates (N)" toggle revealing the rest (`updates.slice(1)`) — relies on `clientUpdates` arriving newest-first |
| `src/components/features/ClarificationEmailCard.tsx` | **Compact summary card only** — no longer renders `ClarificationEmailView`'s full body. Shows subject, "Draft — never sent automatically · N words", the Download button (unchanged, client-side Blob), and a "View full email →" link to `/projects/[id]/outputs/CLARIFICATION_EMAIL` |
| `src/components/features/DraftScopeDocumentCard.tsx` | **Compact summary card only** — no longer renders `DraftScopeDocumentView` or the "Gaps Carried Forward" warning. Shows version/timestamp, "6 sections · N gaps flagged" (6 fixed by `DraftScopeDocumentSchema`'s shape), Generate/Regenerate (unchanged), and a "View full draft →" link to `/projects/[id]/outputs/DRAFT_SCOPE_DOCUMENT` |
| `src/components/features/WorkflowStepList.tsx` | Unchanged — still renders Phase 2/3's step cards exactly as before |
| `src/components/features/ProjectWorkflow.tsx` | Builds `phase1Content`/`phase1Status` (via `derivePhase1Status`) for `StageTracker`, plus `contentByStage` for stages 5-10. Sidebar unchanged and is now the **only** place `EditableChecklist` renders: `ChatPanel`, `KnowledgeUpload`, `EditableChecklist` |
| `src/components/features/EditableChecklist.tsx` | Each item: checkbox + an always-editable `detailText` `<input>`, submitted on blur via `updateChecklistItemDetailAction`. Renders in exactly one place now (`ProjectWorkflow`'s sidebar) — the cross-instance-sync key (`` `${id}-${isComplete}-${detailText ?? ""}` ``) is retained defensively but no longer has a second instance to sync against |
| `src/components/features/PositionDocumentView.tsx` | "What We Need to Find Out" now uses a new `TruncatedList` helper — lists over 6 items show the first 5 plus a `<details>` "Show N more" toggle. "What We Know" and "Client-Flagged Open Items" are deliberately never truncated, at any length |
| `src/components/features/ChecklistView.tsx` | Read-only checklist (immutable Stage-1 Document snapshot) — `ChecklistItemView` includes `detailText` |
| `src/components/features/{ChatPanel,KnowledgeUpload}.tsx` | Unchanged |
| `src/components/features/{ClarificationEmailView,DraftScopeDocumentView,DeliverablesServicesDocumentView,EditableOtherLabel}.tsx` | Unchanged — still the renderers used by `DocumentVersionContent` on the canonical Outputs Library/Version History pages |
| `src/components/features/{SpecialistFeedbackForm,DocumentVersionContent}.tsx` | Unchanged — Phase 2/Version History |

### Source Files — Agents, parsing, data layer
| File | Purpose |
|------|---------|
| `src/services/agents/{intake-agent,clarification-extraction,triage-agent,specialist-review-extraction,chatbot}.ts` | **Unchanged** across both Phase 1 sessions |
| `src/services/parsing/index.ts` | Unchanged |
| `src/lib/{prisma,phases}.ts`, `prisma/schema.prisma` | Unchanged this session. Schema's only recent addition: `ChecklistItem.detailText String?` (migration `20260817105741_add_checklist_detail_text`, prior session) |
| `prisma/seed.ts` | Unchanged |

### Configuration Files
Unchanged from prior sessions — see `.gitignore`, `package.json` (`postinstall: prisma generate`), `.claude/launch.json` (`dev`/`prod` configs), `eslint.config.mjs`, `vitest.config.mts`.

### Test Files (149 total, all passing)
This session's changes: new `tests/components/PositionDocumentView.test.tsx` (5 — truncation threshold, "Show N more" toggle, "What We Know"/"Client-Flagged Open Items" never truncate). `ClientUpdateComposer.test.tsx`, `ClarificationEmailCard.test.tsx`, `DraftScopeDocumentCard.test.tsx` rewritten for the collapsed/compact behavior. `Phase1Workspace.test.tsx` gained progress-strip tests and an explicit "does not render the checklist" test (replacing the old "renders it, kept in sync" test). `ProjectWorkflow.test.tsx`'s checklist test renamed and now asserts exactly 1 instance, not 2. All other test files unchanged from the prior session's 140.

## Key Dependencies
Unchanged: `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored) and Vercel Production. Never `Read` `.env.local` as a whole file — use `grep`/`sed` on specific lines.

## Deployment
Live URL: `https://project-brain-ten.vercel.app`. Vercel team `MAP` (scope `map25`), project `project-brain`, linked to `github.com/paulworrall/Project_Brain`'s `main` for continuous deployment. The prior Phase 1 rework session's commit was pushed and deployed; **this session's progressive-disclosure redesign is committed locally but not yet pushed** — pending user review, per explicit instruction. Redeploy manually: `npx vercel deploy --prod --scope map25`.

## Toolchain Notes (this machine)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64`; prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands (`migrate dev`, `db execute`, `db seed`, `studio`) require WSL** on this machine (unsigned native binary blocked by endpoint security): `wsl -d Ubuntu -- bash -c 'PATH="$HOME/node-portable/node-v24.19.0-linux-x64/bin:$PATH"; cd "/mnt/c/Users/PaulWorrall/Documents/Project_Brain" && npx prisma migrate dev --name <name>'`. `npm run dev`/`test`/`build`/`prisma generate` all work fine natively on Windows.
- **After any `npm install` from WSL, immediately run `npm install` again from native Windows** — the two platforms' optional-dependency binaries don't reliably coexist.
- **jest-dom's `.toBeVisible()` vs `.toBeInTheDocument()`**: a native `<details>`'s children stay mounted in the DOM even when collapsed. Asserting a collapsed section's content is hidden requires `.not.toBeVisible()` (jest-dom understands closed `<details>`), not `.not.toBeInTheDocument()` (only checks presence).

## Current State Summary
All Level 1 MVP scope plus post-MVP additions (Phase Presentation Layer, taxonomy navigation + global search, Client-level commercial documents) remain complete and previously verified. **Prior session**: Phase 1 reworked from a rigid 4-step gated sequence into a fluid workspace (repeatable client updates, on-demand Draft Scope Document generation, always-editable checklist detail field) — pushed and live. **This session**: that new workspace shipped too long, with a real bug (the checklist rendered twice — main column and sidebar). Fixed the duplication (removed `Phase1Workspace`'s own `EditableChecklist`, kept only the sidebar's) and redesigned the whole workspace around progressive disclosure using the codebase's existing `<details>` pattern, no new interaction style: a compact live-computed progress-summary strip; a "Show N more" truncation for the "What We Need to Find Out" list (only — "What We Know"/"Client-Flagged Open Items" stay fully visible, since they're this redesign's primary focus); "Previous updates" collapsed to the latest entry plus a "View all updates (N)" toggle; and — the biggest length reduction — the Clarification Email and Draft Scope Document no longer render their full content inline at all, replaced with compact summary cards (title/version, one computed stat, existing actions, a "View full →" link). The existing Outputs Library / Version History page is the single canonical place those documents render in full; no second full-content rendering path was added, and the "Gaps Carried Forward" warning moved there with the rest of the Draft Scope Document's content rather than staying duplicated on the Phase 1 page. Verified end-to-end in the browser against the real "Lemonade project" (which was carrying 2 real client updates and a 17-gap Draft Scope Document from prior live testing — a genuinely useful stress case): progress strip, truncation, update-history collapse, and both "View full →" links all confirmed working, landing on a Version History page that renders the complete content correctly. Full suite (149 tests, up from 140), typecheck, lint, and production build are all clean. This checkpoint's commit is local-only — do not push until the user explicitly reviews and approves, per this session's instruction.
