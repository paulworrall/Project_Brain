# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus several post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), full Client/Workstream taxonomy navigation + global search, Client-level commercial documents (MSAs/Rate Cards) with the app's first real role enforcement, and — newest — **Phase 1 reworked from a 4-step gated sequence into a single fluid workspace** (`Phase1Workspace.tsx`), since real clarification happens repeatedly over days/weeks rather than as a one-shot step. Phases 2-3 (Stages 5-9) still render as the original step-card list; only Phase 1's presentation and invocation timing changed — the underlying Document/DocumentVersion/Stage models and the Triage/Clarification agents themselves are untouched. Stage 6 is unlocked but not built; Stages 7-10 are inert placeholders.

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
| `src/app/(dashboard)/projects/new/page.tsx` + `NewProjectForm.tsx` + `actions.ts` | Project creation: brief upload/paste, Client-scoped Rate Card select, runs the full Intake Agent. `createProjectAction` now marks Stage 1 **and** Stage 2 `COMPLETE` at creation (the Clarification Email is generated as part of Intake, no longer its own pipeline step) and opens Stage 3 `IN_PROGRESS`; `currentStageNumber` starts at 3 |
| `src/components/layout/{Header,Sidebar,Footer}.tsx` | Header renders `GlobalProjectSearch` inline |
| `src/components/features/{ClientWorkstreamCard,WorkstreamProjectsTable,GlobalProjectSearch}.tsx` | Taxonomy navigation components — plain pre-mapped props, no raw Prisma types |
| `src/components/features/{MasterServiceAgreementsPanel,RateCardsPanel}.tsx` | Client-level commercial document list+form panels, role-gated (UX nicety only — see `permissions.ts`) |

### Source Files — Project workflow (the pipeline console)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — fetches Documents/ChecklistItems/all `TouchpointNote`s (now mapped to a full `clientUpdates` log, not just the latest one)/KnowledgeItems/Stages; passes everything to `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | **Phase 1 actions, reworked to be repeatable**: `submitClientUpdateAction` (was `submitClarificationNotesAction`) — runs clarification extraction, adds a Position Document version + `TouchpointNote`; callable any number of times, never touches `ProjectStageStatus`. `generateDraftScopeDocumentAction` (was `runTriageAgentAction`) — on first run transitions Stage 3/4→`COMPLETE`, Stage 5→`IN_PROGRESS` (upserts, not updates — see bug note below); on later runs just appends a new `DocumentVersion`. `updateChecklistItemDetailAction` — persists `ChecklistItem.detailText` independently of `isComplete`. Unchanged: `submitSpecialistFeedbackAction`, `toggleChecklistItemAction`, `updateOtherServiceLabelAction`, `uploadKnowledgeItemAction`, `askChatbotAction`, `updateProjectSummaryAction` |
| `src/components/features/StageTracker.tsx` | Renders 3 Phase `<details>` cards. Phase 1 now takes explicit `phase1Status: "NOT_STARTED"\|"IN_PROGRESS"\|"READY_FOR_SPECIALIST_REVIEW"` + `phase1Content: ReactNode` props instead of deriving its badge/content from `steps` the way Phase 2/3 still do — badge reads "Not started"/"In progress"/"Ready for specialist review" instead of "x/4 stages". `READY_FOR_SPECIALIST_REVIEW` is a status flag only; the real Phase 1→2 handoff UX is deferred to when Phase 2 is reviewed next |
| `src/components/features/Phase1Workspace.tsx` | **New** — Phase 1's fluid workspace: live Position Document (`PositionDocumentView`, reused as-is) under "Current position", `ClientUpdateComposer`, `ClarificationEmailCard` + `DraftScopeDocumentCard` side by side, `EditableChecklist` beneath |
| `src/components/features/ClientUpdateComposer.tsx` | **New** — "Add a client update" textarea bound to `submitClientUpdateAction`, keyed on the log's length so a successful submit remounts/clears the form while a failed one preserves the draft; renders the full timestamped log beneath |
| `src/components/features/ClarificationEmailCard.tsx` | **New** — wraps `ClarificationEmailView` with a client-side Blob/`<a download>` Download button (no server round-trip); shows "Not yet generated" when absent |
| `src/components/features/DraftScopeDocumentCard.tsx` | **New** — Generate/Regenerate button bound to `generateDraftScopeDocumentAction`; shows version number + timestamp once generated |
| `src/components/features/WorkflowStepList.tsx` | Unchanged — still renders Phase 2/3's step cards exactly as before |
| `src/components/features/ProjectWorkflow.tsx` | Builds `phase1Content`/`phase1Status` (via `derivePhase1Status`) for `StageTracker`, plus `contentByStage` for stages 5-10 only (1-4's content moved into `Phase1Workspace`). Sidebar unchanged: `ChatPanel`, `KnowledgeUpload`, `EditableChecklist` |
| `src/components/features/EditableChecklist.tsx` | Each item: checkbox (unchanged) + an always-editable `detailText` `<input>`, submitted on blur via `updateChecklistItemDetailAction`. Cross-instance sync key extended to `` `${id}-${isComplete}-${detailText ?? ""}` `` — this checklist still renders in two places (the workspace and the sidebar) |
| `src/components/features/ChecklistView.tsx` | Read-only checklist (immutable Stage-1 Document snapshot) — `ChecklistItemView` now includes `detailText` |
| `src/components/features/{ChatPanel,KnowledgeUpload}.tsx` | Unchanged |
| `src/components/features/{ClarificationEmailView,PositionDocumentView,DraftScopeDocumentView,DeliverablesServicesDocumentView,EditableOtherLabel}.tsx` | Unchanged presentational/document renderers, reused by both the live workflow and Version History |
| `src/components/features/{SpecialistFeedbackForm,DocumentVersionContent}.tsx` | Unchanged — Phase 2/Version History |
| ~~`ClarificationNotesForm.tsx`, `RunTriageAgentButton.tsx`~~ | **Deleted** — fully superseded by the Phase 1 rework |

### Source Files — Agents, parsing, data layer
| File | Purpose |
|------|---------|
| `src/services/agents/{intake-agent,clarification-extraction,triage-agent,specialist-review-extraction,chatbot}.ts` | **Unchanged.** All agent logic itself is untouched by the Phase 1 rework — only how/when the Server Actions invoke `clarification-extraction` and `triage-agent` changed |
| `src/services/parsing/index.ts` | Unchanged |
| `src/lib/{prisma,phases}.ts`, `prisma/schema.prisma` | `phases.ts` unchanged. Schema: added `ChecklistItem.detailText String?` (migration `20260817105741_add_checklist_detail_text`) — the only schema change this session; `TouchpointNote` already supported many-per-project with no unique constraint, so no migration was needed there |
| `prisma/seed.ts` | Unchanged |

### Configuration Files
Unchanged from prior sessions — see `.gitignore`, `package.json` (`postinstall: prisma generate`), `.claude/launch.json` (`dev`/`prod` configs), `eslint.config.mjs`, `vitest.config.mts`.

### Test Files (140 total, all passing)
Prior baseline (~127) plus this session's additions: `tests/phase1-workspace.test.ts` (4, real-DB — repeated client updates, repeated Draft Scope Document generation without regressing Stage 5, checklist `detailText` independence, and a regression test for a project with no pre-existing Stage 3 status row). `tests/components/{ClientUpdateComposer,ClarificationEmailCard,DraftScopeDocumentCard,Phase1Workspace}.test.tsx` (new). `StageTracker.test.tsx` and `ProjectWorkflow.test.tsx` rewritten for the new Phase 1 props (Phase 2/3 assertions otherwise unchanged — proving they're unaffected). `EditableChecklist.test.tsx` extended (5→7) and picked up its own latent bug fix (mock call counts weren't reset between tests in that file). `tests/stage-1-5-happy-path.test.ts` updated for the renamed actions, same final-state assertions. All other test files unchanged.

## Key Dependencies
Unchanged: `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg`, `next-auth` ^5.0.0-beta.32, `zod` ^4, `@anthropic-ai/sdk`, `officeparser`, `vitest`, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — all real, in `.env.local` (gitignored) and Vercel Production. Never `Read` `.env.local` as a whole file — use `grep`/`sed` on specific lines.

## Deployment
Live URL: `https://project-brain-ten.vercel.app`. Vercel team `MAP` (scope `map25`), project `project-brain`, linked to `github.com/paulworrall/Project_Brain`'s `main` for continuous deployment. **This session's Phase 1 rework is committed locally but not yet pushed** — pending user review before push/deploy, per explicit instruction. Redeploy manually: `npx vercel deploy --prod --scope map25`.

## Toolchain Notes (this machine)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64`; prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands (`migrate dev`, `db execute`, `db seed`, `studio`) require WSL** on this machine (unsigned native binary blocked by endpoint security): `wsl -d Ubuntu -- bash -c 'PATH="$HOME/node-portable/node-v24.19.0-linux-x64/bin:$PATH"; cd "/mnt/c/Users/PaulWorrall/Documents/Project_Brain" && npx prisma migrate dev --name <name>'`. `npm run dev`/`test`/`build`/`prisma generate` all work fine natively on Windows.
- **After any `npm install` from WSL, immediately run `npm install` again from native Windows** — the two platforms' optional-dependency binaries don't reliably coexist.

## Current State Summary
All Level 1 MVP scope plus post-MVP additions (Phase Presentation Layer, taxonomy navigation + global search, Client-level commercial documents) remain complete and previously verified. **This session's work**: Phase 1 ("Clarifying the brief and scope") reworked from a rigid 4-step gated sequence into a single fluid workspace — a live Position Document summary, a repeatable "Add a client update" composer with a timestamped log, an on-demand Generate/Regenerate Draft Scope Document card, and an always-editable checklist detail field — reflecting that real clarification happens repeatedly outside the platform rather than as a one-shot step. Phase 2/3 presentation is completely unaffected (verified by both rewritten unit tests and live browser checks of the Phase 1→2 handoff). Backend actions were renamed (`submitClarificationNotesAction`→`submitClientUpdateAction`, `runTriageAgentAction`→`generateDraftScopeDocumentAction`) and made genuinely repeatable, with idempotent-on-first-run-only stage transitions so re-running doesn't regress later progress. One real bug was found via live browser testing against the pre-existing seeded "Lemonade project" (a legacy project missing a `ProjectStageStatus` row this new code assumed existed) and fixed with a regression test added to lock it in. Full suite (140 tests), typecheck, lint, and production build are all clean. This checkpoint's commit is local-only — do not push until the user explicitly reviews and approves, per this session's instruction.
