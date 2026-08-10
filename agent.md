# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. The full data schema is built, and all four agent pipelines (Intake, Clarification Extraction + Triage, Specialist Review Extraction, Chatbot) are live and verified end-to-end against the real Claude API and real Neon database. The project page is a "workflow console": a compact Stage Tracker strip, then a numbered, expandable step list (all 10 pipeline stages) beside a sidebar stack of Cards — the chatbot, the ad-hoc knowledge-upload form + list, and the live Set-Up Checklist (the checklist also appears inline on Step 1). A separate Outputs Library page lists every Document the project has produced, and each links to a Version History page for that artifact. Stages 1-5 of the pipeline work fully, plus the cross-cutting Knowledge Upload and Chatbot features; Stage 6 is unlocked but not yet built; Stages 7-10 render as inert placeholders.

## File Inventory

### Source Files — Auth
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider with real `authorize()` (Prisma lookup + `bcrypt.compare`), JWT session strategy, `role`/`id` on session via callbacks |
| `src/proxy.ts` | Route protection (Next 16 `proxy.ts`, not `middleware.ts`) — redirects unauthenticated users to `/login`, authenticated users away from `/login`/`/signup` to `/` |
| `src/types/next-auth.d.ts` | Module augmentation adding `role`/`id` to `Session`/`User`/`JWT`. **Note**: the JWT augmentation must target `"@auth/core/jwt"`, not `"next-auth/jwt"` (the latter is a wildcard re-export and doesn't support declaration merging) |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| `src/app/(auth)/layout.tsx` | Centered, sidebar-free layout for login/signup |
| `src/app/(auth)/login/page.tsx` + `LoginForm.tsx` + `actions.ts` | Login screen; `useActionState` + Server Action calling `signIn()`, catching `AuthError` for a friendly message |
| `src/app/(auth)/signup/page.tsx` + `SignupForm.tsx` + `actions.ts` | Signup screen; Zod-validated Server Action, hashes password, creates `User`, auto-signs-in |

### Source Files — Dashboard shell
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Header + Sidebar + Footer shell for all authenticated routes. `<main>` carries `min-w-0` alongside `flex-1` — without it, a wide descendant (e.g. the Stage Tracker's horizontally-scrolling row) forces the whole page to overflow horizontally instead of scrolling within its own container, since flex items don't shrink below their content's intrinsic width by default |
| `src/app/(dashboard)/page.tsx` | Taxonomy browser (`/`) — Server Component, real Prisma query, Hub → Client → Workstream → Project nested cards with Stage badges, "+ New Project" link |
| `src/app/(dashboard)/projects/new/page.tsx` + `NewProjectForm.tsx` + `actions.ts` | Project creation: pick a Workstream, name the project, paste or upload a brief (.docx/.pdf/.pptx/.txt). Server Action parses the brief, runs the full Intake Agent, persists everything in one transaction, redirects to the new Project Detail page |
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — breadcrumb (with an "Outputs Library →" link), `notFound()` on bad id, fetches Documents/latest DocumentVersions/ChecklistItems/KnowledgeItems and all 10 Stage rows with this project's own ProjectStageStatus. Fetches all `TouchpointNote`s (ordered `createdAt desc`, no type filter) and derives `clarificationNotes`/`specialistFeedback` via `.find(n => n.type === ...)`. Parses the latest `DELIVERABLES_SERVICES_DOCUMENT` version via `DeliverablesServicesDocumentSchema.safeParse`. Passes everything into `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/outputs/page.tsx` | Outputs Library — lists every `Document` this project has (in stage order via `DOCUMENT_TYPE_ORDER`), each showing its latest version's number/stage/timestamp/author and a "View version history →" link |
| `src/app/(dashboard)/projects/[projectId]/outputs/[documentType]/page.tsx` | Version History for one document type — validates the route param against the `DocumentType` enum (`notFound()` otherwise), lists every version newest-first, each in a native `<details>` (most recent `open` by default) rendering its content via `DocumentVersionContent` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | `submitClarificationNotesAction`, `runTriageAgentAction`, `submitSpecialistFeedbackAction`, `updateOtherServiceLabelAction`, `toggleChecklistItemAction` (flips one `ChecklistItem.isComplete`, scoped by both `id` and `projectId`), `updateProjectSummaryAction`, `uploadKnowledgeItemAction` (paste-note-or-upload-file, reuses `parseDocumentToText`, mutually-exclusive validation mirroring `createProjectAction`), `askChatbotAction` (no `revalidatePath` — doesn't mutate anything, just calls `answerProjectQuestion` and returns `{answer}` or `{message}`). All `(projectId, [itemId,] prevState, formData)`, called via `.bind(null, ...)` from their client components, all use `revalidatePath` (not `redirect`) where they mutate the current page rather than navigating away |
| `src/components/layout/Header.tsx` | Server Component; shows session user + role, inline Server Action sign-out form |
| `src/components/layout/Sidebar.tsx` | Primary nav (currently just "All Projects") |
| `src/components/layout/Footer.tsx` | Static footer |
| `src/components/features/ProjectSummaryBar.tsx` | Client Component, view/edit toggle card rendered between the breadcrumb and the Stage Tracker. View mode: status badge (`ACTIVE`/`COMPLETE`, computed server-side) + Job Code/Kick-off/Target Completion/PM with "Not yet set" fallbacks. Edit mode: form (text, 2 dates, a `<select>` of `DELIVERY`-role Users only) bound to `updateProjectSummaryAction` |
| `src/components/features/StageTracker.tsx` | Presentational (no client JS) horizontal strip — numbered/checked node per stage, connecting line colored by status, wrapped in its own `overflow-x-auto` so a project page never needs to scroll wider than its container. Stages beyond `MVP_STAGE_COUNT` (5) render with a dashed ring and a "Later" caption, independent of their actual status |
| `src/components/features/ProjectWorkflow.tsx` | Server Component — the project page's main content. Renders `StageTracker` above the two-column grid, and builds a `content: ReactNode` per stage (real artifacts for stages 1-5, "Coming in task X.X" placeholders for 6-10). The sidebar column stacks `ChatPanel`, `KnowledgeUpload`, `EditableChecklist` (in that order — matching the original mockup's chat → additional-inputs → checklist layout). `EditableChecklist` also renders inline inside Step 1's own content, by design (see the ad-hoc note below on why both copies coexist) |
| `src/components/features/WorkflowStepList.tsx` | Client Component — the numbered step list. One step expanded at a time (defaults to the first non-`COMPLETE` stage **at mount**, then preserved as local state — it does not recompute on prop changes, so a step stays open across a `revalidatePath` refresh even after its status changes), status badge (Pending/In Progress/Complete) + step-kind subtitle (AI Agent vs Human Input, from `STEP_KIND_BY_STAGE` in `src/types/workflow.ts`) |
| `src/components/features/ChatPanel.tsx` | Client Component — the real, interactive project-scoped chatbot. Local `messages: {role, content}[]` state (ephemeral, not persisted — no `ChatMessage` model exists or is needed); on submit, optimistically appends the user's question, then `askChatbotAction` (bound to `projectId`) resolves and a `useEffect` keyed on **object reference** (not content) appends the answer/error exactly once per real dispatch, so an unrelated page re-render never re-appends a stale message and a repeated identical answer isn't deduped away |
| `src/components/features/KnowledgeUpload.tsx` | Client Component — the "Additional Inputs" card. Title + paste-note-or-upload-file toggle (mirrors `NewProjectForm`'s pattern) bound to `uploadKnowledgeItemAction`, plus a list of existing `KnowledgeItem`s (title + type/filename). Available at any time, any Stage — not gated by workflow progress |
| `src/components/features/{ClarificationEmailView,PositionDocumentView,DraftScopeDocumentView}.tsx` | Presentational renderers for the Intake/Triage artifact types — take only their content prop, so they're reused as-is for both the live workflow step and (via `DocumentVersionContent`) the Version History page |
| `src/components/features/ChecklistView.tsx` | Read-only checklist renderer, used only for the immutable `CHECKLIST` Document artifact's version history (a frozen Stage-1 snapshot) — copy explicitly points to the live checklist elsewhere on the page. The interactive live checklist is `EditableChecklist`, not this component |
| `src/components/features/EditableChecklist.tsx` | Client Component — the live, tickable Set-Up Checklist, rendered in **two places at once** (Step 1's content and the sidebar) bound to the same server data. Each item is its own `<form>` bound to `toggleChecklistItemAction.bind(null, projectId, item.id)` via `useActionState`, auto-submitting on checkbox change. Each `EditableChecklistItem` is keyed on `` `${item.id}-${item.isComplete}` ``, not just `item.id` — this forces a full remount (fresh `useActionState`, fresh derived `checked`) the instant *either* copy's toggle completes, which is what keeps the two live copies from drifting out of sync; a plain `key={item.id}` with an uncontrolled or `useEffect`-resynced checkbox does not reliably do this (see progress.md's ad-hoc note for how this was found) |
| `src/components/features/ClarificationNotesForm.tsx` | Step 3 Client Component — textarea + submit, bound to `submitClarificationNotesAction`. `ProjectWorkflow` swaps this for read-only notes + the updated Position Document once a `CLARIFICATION_REPLY` TouchpointNote exists |
| `src/components/features/RunTriageAgentButton.tsx` | Step 4 Client Component — button bound to `runTriageAgentAction`, shown only while Stage 4 is `IN_PROGRESS` and no Draft Scope Document exists yet |
| `src/components/features/SpecialistFeedbackForm.tsx` | Step 5 Client Component — mirrors `ClarificationNotesForm`; textarea + submit, bound to `submitSpecialistFeedbackAction` |
| `src/components/features/DeliverablesServicesDocumentView.tsx` | Renders the Deliverables + Services Document — Deliverables list, Services table (5 fixed rows via `SERVICE_ROWS` + the 6th "Other" row), Open Questions/Risks, Outstanding Gaps Carried Forward (warning-styled Card). Takes an optional `readOnly` prop — when true (non-latest versions in Version History) the "Other" label renders as plain text instead of the editable control |
| `src/components/features/EditableOtherLabel.tsx` | Client Component — click-to-edit toggle for the "Other" service row's free-text label, bound to `updateOtherServiceLabelAction.bind(null, projectId)` via `useActionState` |
| `src/components/features/DocumentVersionContent.tsx` | Dispatcher used by both the Outputs Library and Version History pages — given a `DocumentType` and a version's raw JSON `content`, Zod-parses it against the matching schema and renders the matching View component read-only; falls back to a friendly "couldn't be read" message on a schema mismatch (defensive only) |
| `src/components/ui/{Button,Input,Label,Card,FormError}.tsx` | Shared primitives styled from the `@theme` tokens in `globals.css` |

### Source Files — Agents & parsing
| File | Purpose |
|------|---------|
| `src/lib/anthropic.ts` | Anthropic SDK client singleton + `CLAUDE_MODEL = "claude-opus-5"` constant. **Note**: this singleton is constructed at module-load time from `process.env.ANTHROPIC_API_KEY` — a standalone script that statically `import`s anything transitively importing this module before calling `dotenv`'s `config()` will silently get no API key, since static imports are hoisted above other top-level code. Any future throwaway smoke-test script needs a dynamic `await import(...)` after `config()`, not a static import |
| `src/types/intake.ts` | Zod schemas + inferred types for the 3 Intake Agent artifacts, plus `SetupChecklistSchema`/`SetupChecklist`. `PositionDocumentFieldsSchema` is reused unchanged by the Clarification Extraction step |
| `src/types/triage.ts` | `DraftScopeDocumentSchema`/`DraftScopeDocument` |
| `src/types/deliverables-services.ts` | `DeliverablesServicesDocumentSchema`/`DeliverablesServicesDocument` — a fixed object (not array) of the 6 Services capability rows, plus `SERVICE_ROWS` |
| `src/types/workflow.ts` | `WorkflowStep`/`StepStatus` types, plus `STEP_KIND_BY_STAGE` |
| `src/types/documents.ts` | `DOCUMENT_TYPE_LABELS`/`DOCUMENT_TYPE_ORDER` — shared by the Outputs Library and Version History pages |
| `src/services/agents/intake-agent.ts` | `classifyBrief`, `extractPositionFields`, `generateClarificationEmail`, `generateSetupChecklist` (pure, no AI), `runIntakeAgent`, `IntakeAgentError` |
| `src/services/agents/clarification-extraction.ts` | `extractClarificationUpdate(currentPositionDocument, clarificationNotes)`. `ClarificationExtractionError` |
| `src/services/agents/triage-agent.ts` | `generateDraftScopeDocument(positionDocument)`. `TriageAgentError` |
| `src/services/agents/specialist-review-extraction.ts` | `extractDeliverablesAndServices(draftScopeDocument, specialistFeedback)`. `SpecialistReviewExtractionError` |
| `src/services/agents/chatbot.ts` | `assembleProjectContext(projectId)` — DB reads (Documents, ChecklistItems, TouchpointNotes, KnowledgeItems), every query filtered by `projectId` **and** every result row re-filtered by `projectId` again before being folded into context (belt-and-braces isolation guard, not just the WHERE clause). `answerQuestionFromContext(context, question)` — the one Claude call, pure (no DB access), structured `{answer: string}` output. `answerProjectQuestion(projectId, question)` — convenience wrapper chaining the two. `ChatbotError`. **Deliberate exception** to this codebase's usual "DB reads live in `actions.ts`, agents are pure" pattern — see progress.md's task 8.0 notes for why |
| `src/services/parsing/index.ts` | `parseDocumentToText(buffer, fileName)` — reused unchanged by `uploadKnowledgeItemAction` for uploaded knowledge documents, not just briefs. Throws `UnsupportedBriefFormatError` for unsupported extensions |

All agent modules follow the same shape: one typed error class wrapping `Anthropic.RateLimitError`/`APIError`, `messages.parse()` + `zodOutputFormat()` for structured output, `claude-opus-5`.

### Source Files — Data layer
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma Client singleton using `@prisma/adapter-pg` |
| `src/generated/prisma/*` | Generated Prisma Client output (gitignored) |
| `prisma/schema.prisma` | Full schema: taxonomy, Stage/ProjectStageStatus, Document/DocumentVersion, ChecklistItem, TouchpointNote, `KnowledgeItem` (`type: DOCUMENT|NOTE`, `title`, `content`, `originalFileName?`, `uploadedById?`, `uploadedAt`) — defined since task 2.0, first actually used in task 8.0, no migration needed. User, plus `Project`'s nullable summary fields |
| `prisma.config.ts` | Loads `.env.local`, wires `DATABASE_URL`, `seed: "tsx prisma/seed.ts"` |
| `prisma/migrations/20260806190913_init/`, `.../20260807101251_add_project_summary_fields/` | Applied to the real Neon dev database |
| `prisma/seed.ts` | 10 Stages, Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth` (one Workstream each), demo Project, two demo Users |

### Directory scaffolding (still empty, `.gitkeep` placeholder)
`src/styles`

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `test` (`vitest run`), `test:watch` |
| `eslint.config.mjs` | Flat config + `eslint-config-prettier`. `@typescript-eslint/no-unused-vars` overridden with `argsIgnorePattern`/`varsIgnorePattern: "^_"` |
| `vitest.config.mts` | Default `node` environment (for DB tests); component tests opt into `jsdom` per-file via `// @vitest-environment jsdom` |
| `tests/setup.ts` | Loads `.env.local`, registers `@testing-library/jest-dom` matchers, manual `afterEach(cleanup)` |
| `src/app/globals.css` | Tailwind v4 `@theme` design tokens. Deliberate single light palette, no dark mode yet |
| `.gitignore` | Standard Next.js ignores + `/src/generated/prisma` + env-file rules |
| `.env.local.example` / `.env.local` | `DATABASE_URL` and `ANTHROPIC_API_KEY` are **real and working**. `NEXTAUTH_SECRET` is still a placeholder |
| `AGENTS.md`, `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/` | Auto-installed version-matched docs — kept intentionally |
| `.claude/launch.json` | Dev-server launch config for the Browser preview tool (`npm run dev`, port 3000) |

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `tests/schema.test.ts` | 9 — DB constraints/relations against real Neon dev DB | ✅ passing |
| `tests/chatbot-isolation.test.ts` | 2 — real-DB, two Projects under one Client, proves `assembleProjectContext` never leaks the other project's Documents/ChecklistItems/TouchpointNotes/KnowledgeItems in either direction | ✅ passing |
| `tests/components/WorkflowStepList.test.tsx` | 3 | ✅ passing |
| `tests/components/StageTracker.test.tsx` | 3 | ✅ passing |
| `tests/components/ProjectWorkflow.test.tsx` | 8 — per-step branching (Steps 3-5) plus sidebar checklist visibility, mocking `.../[projectId]/actions` | ✅ passing |
| `tests/components/EditableChecklist.test.tsx` | 5 — checked state, strikethrough, submits on click, empty-state, re-syncs to a prop update (simulates the sibling-instance-toggled scenario) | ✅ passing |
| `tests/components/DocumentVersionContent.test.tsx` | 5 | ✅ passing |
| `tests/components/ChatPanel.test.tsx` | 3 — empty state, question+answer round trip, error message shown | ✅ passing |
| `tests/components/KnowledgeUpload.test.tsx` | 4 — lists existing items, empty state, paste/upload mode toggle, submits the action | ✅ passing |
| `tests/components/Sidebar.test.tsx` | 1 | ✅ passing |
| `tests/components/LoginForm.test.tsx` | 2 | ✅ passing |
| `tests/components/ProjectSummaryBar.test.tsx` | 4 | ✅ passing |
| `tests/components/EditableOtherLabel.test.tsx` | 3 | ✅ passing |
| `tests/services/intake-agent.test.ts` | 7 | ✅ passing |
| `tests/services/clarification-extraction.test.ts` | 3 | ✅ passing |
| `tests/services/triage-agent.test.ts` | 3 | ✅ passing |
| `tests/services/specialist-review-extraction.test.ts` | 3 | ✅ passing |
| `tests/services/chatbot.test.ts` | 3 — mocked Anthropic, tests `answerQuestionFromContext` (structured output, error wrapping) exactly like every other agent test | ✅ passing |
| `tests/services/parsing.test.ts` | 5 | ✅ passing |

77 tests total. `@anthropic-ai/sdk` is fully mocked in every agent unit test per CLAUDE.md — the only real-API calls in this repo happen via throwaway `_smoke_test.mts` scripts (always deleted after use), never in the committed suite. Cross-project isolation is proven by a real-DB integration test, not mocking, per CLAUDE.md's explicit testing requirement.

## Key Dependencies
- `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4
- `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `pg`, `dotenv`
- `next-auth` ^5.0.0-beta.32, `bcryptjs`, `zod` ^4
- `@anthropic-ai/sdk`, `officeparser`
- Dev/test: `typescript`, `eslint` + `eslint-config-next` + `eslint-config-prettier`, `prettier`, `vitest`, `tsx`, `@testing-library/react` + `jest-dom` + `user-event`, `jsdom`
- `package.json` `overrides`: `pdfjs-dist` pinned to `6.2.108` (patched) — see task 5.0's ad-hoc note in progress.md if this ever needs revisiting.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY` — real, working, in `.env.local` (gitignored). `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — still placeholders.

## Toolchain Notes (this machine — see `progress.md` for full detail)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64` (no admin rights for the standard installer). Prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands require WSL** on this machine (unsigned native binary blocked by endpoint security). `npm run dev`, `npm test`, `npm run build`, `npx prisma generate` all work fine natively on Windows.
- **After any `npm install` from WSL, immediately run `npm install` again from native Windows before doing anything else.**

## Current State Summary
Tasks 1.0–8.0 are all complete, plus three ad-hoc additions along the way (a project-page restructure, a project summary bar, and the checklist also showing in the sidebar). The full Level 1 MVP feature set from the PRP is now built: the Stage 1-5 pipeline end-to-end, Outputs Library + Version History, ad-hoc Knowledge Upload, and the project-scoped Chatbot with cross-project isolation proven by a real-DB integration test. Every feature has been verified in the browser against the real Claude API and real Neon database, not just typechecked — including live-testing chatbot isolation across two real projects (one got a rich, correctly-synthesized answer; the unrelated one correctly reported no context, with zero cross-contamination). Typecheck, lint, full test suite (77 tests), and production build all pass. Next up: task 9.0 — Polish, Testing, QA & Deployment Prep (responsive/accessibility pass, end-to-end happy-path test, secrets audit, Vercel deploy).
