# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. The full data schema and three live AI agent pipelines (Intake, Clarification Extraction + Triage, Specialist Review Extraction) are built and verified end-to-end in the browser against the real Claude API and real Neon database. The project page is a "workflow console": a compact Stage Tracker strip, then a numbered, expandable step list (all 10 pipeline stages) beside a chat/knowledge-upload sidebar. A separate Outputs Library page lists every Document the project has produced, and each links to a Version History page for that artifact. Stages 1-5 of the pipeline work fully; Stage 6 is unlocked (ready for its own task) but not yet built; Stages 7-10, the chatbot, and knowledge upload render as inert placeholders.

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
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — breadcrumb (with an "Outputs Library →" link), `notFound()` on bad id, fetches Documents/latest DocumentVersions/ChecklistItems and all 10 Stage rows with this project's own ProjectStageStatus. Fetches all `TouchpointNote`s (ordered `createdAt desc`, no type filter) and derives `clarificationNotes`/`specialistFeedback` via `.find(n => n.type === ...)`. Parses the latest `DELIVERABLES_SERVICES_DOCUMENT` version via `DeliverablesServicesDocumentSchema.safeParse`. Passes everything into `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/outputs/page.tsx` | Outputs Library — lists every `Document` this project has (in stage order via `DOCUMENT_TYPE_ORDER`), each showing its latest version's number/stage/timestamp/author and a "View version history →" link |
| `src/app/(dashboard)/projects/[projectId]/outputs/[documentType]/page.tsx` | Version History for one document type — validates the route param against the `DocumentType` enum (`notFound()` otherwise), lists every version newest-first, each in a native `<details>` (most recent `open` by default) rendering its content via `DocumentVersionContent` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | `submitClarificationNotesAction` (Step 3 — extraction + Position Doc versioning + Stage 2/3 complete, Stage 4 unlocked), `runTriageAgentAction` (Step 4 — Draft Scope Document + Stage 4 complete, Stage 5 unlocked), `submitSpecialistFeedbackAction` (Step 5 — extraction + Deliverables/Services Document versioning + Stage 5 complete, Stage 6 unlocked), `updateOtherServiceLabelAction` (in-place edit of the "Other" service row's label — not a new version), `toggleChecklistItemAction` (flips one `ChecklistItem.isComplete`, scoped by both `id` and `projectId`), `updateProjectSummaryAction` (Job Code/Kick-off/Target Completion/PM — no stage side effects). All `(projectId, [itemId,] prevState, formData)`, called via `.bind(null, ...)` from their client components, all use `revalidatePath` (not `redirect`) since they mutate the current page rather than navigating away |
| `src/components/layout/Header.tsx` | Server Component; shows session user + role, inline Server Action sign-out form |
| `src/components/layout/Sidebar.tsx` | Primary nav (currently just "All Projects") |
| `src/components/layout/Footer.tsx` | Static footer |
| `src/components/features/ProjectSummaryBar.tsx` | Client Component, view/edit toggle card rendered between the breadcrumb and the Stage Tracker. View mode: status badge (`ACTIVE`/`COMPLETE`, computed server-side) + Job Code/Kick-off/Target Completion/PM with "Not yet set" fallbacks. Edit mode: form (text, 2 dates, a `<select>` of `DELIVERY`-role Users only) bound to `updateProjectSummaryAction` |
| `src/components/features/StageTracker.tsx` | Presentational (no client JS) horizontal strip — numbered/checked node per stage, connecting line colored by status, wrapped in its own `overflow-x-auto` so a project page never needs to scroll wider than its container. Stages beyond `MVP_STAGE_COUNT` (5) render with a dashed ring and a "Later" caption, independent of their actual status |
| `src/components/features/ProjectWorkflow.tsx` | Server Component — the project page's main content. Renders `StageTracker` above the two-column grid, and builds a `content: ReactNode` per stage (real artifacts for stages 1-5, "Coming in task X.X" placeholders for 6-10). Includes `SpecialistReviewStepContent` (Stage 5): branches on `specialistFeedback === null` → `SpecialistFeedbackForm`, else → read-only feedback + `DeliverablesServicesDocumentView` (or "Not generated yet.") |
| `src/components/features/WorkflowStepList.tsx` | Client Component — the numbered step list. One step expanded at a time (defaults to the first non-`COMPLETE` stage **at mount**, then preserved as local state — it does not recompute on prop changes, so a step stays open across a `revalidatePath` refresh even after its status changes), status badge (Pending/In Progress/Complete) + step-kind subtitle (AI Agent vs Human Input, from `STEP_KIND_BY_STAGE` in `src/types/workflow.ts`) |
| `src/components/features/ChatPanel.tsx` | Static sidebar placeholder — project-scoped chatbot (tasks 8.3-8.4) + knowledge upload (8.1-8.2), both disabled/labeled "coming in task X.X" |
| `src/components/features/{ClarificationEmailView,PositionDocumentView,DraftScopeDocumentView}.tsx` | Presentational renderers for the Intake/Triage artifact types — take only their content prop, so they're reused as-is for both the live workflow step and (via `DocumentVersionContent`) the Version History page |
| `src/components/features/ChecklistView.tsx` | Read-only checklist renderer, now used only for the immutable `CHECKLIST` Document artifact's version history (a frozen Stage-1 snapshot) — copy explicitly points to the live checklist on the project page. The interactive live checklist is `EditableChecklist`, not this component |
| `src/components/features/EditableChecklist.tsx` | Client Component — the live, tickable Set-Up Checklist shown on Step 1. Each item is its own `<form>` bound to `toggleChecklistItemAction.bind(null, projectId, item.id)` via `useActionState`, auto-submitting on checkbox change via `form.requestSubmit()` |
| `src/components/features/ClarificationNotesForm.tsx` | Step 3 Client Component — textarea + submit, bound to `submitClarificationNotesAction`. `ProjectWorkflow` swaps this for read-only notes + the updated Position Document once a `CLARIFICATION_REPLY` TouchpointNote exists |
| `src/components/features/RunTriageAgentButton.tsx` | Step 4 Client Component — button bound to `runTriageAgentAction`, shown only while Stage 4 is `IN_PROGRESS` and no Draft Scope Document exists yet |
| `src/components/features/SpecialistFeedbackForm.tsx` | Step 5 Client Component — mirrors `ClarificationNotesForm`; textarea + submit, bound to `submitSpecialistFeedbackAction` |
| `src/components/features/DeliverablesServicesDocumentView.tsx` | Renders the Deliverables + Services Document — Deliverables list, Services table (5 fixed rows via `SERVICE_ROWS` + the 6th "Other" row), Open Questions/Risks, Outstanding Gaps Carried Forward (warning-styled Card). Takes an optional `readOnly` prop — when true (used for non-latest versions in Version History) the "Other" label renders as plain text instead of the editable control, since editing an old version doesn't make sense |
| `src/components/features/EditableOtherLabel.tsx` | Client Component — click-to-edit toggle for the "Other" service row's free-text label (button showing the label → text input + Save/Cancel on click), bound to `updateOtherServiceLabelAction.bind(null, projectId)` via `useActionState` |
| `src/components/features/DocumentVersionContent.tsx` | Dispatcher used by both the Outputs Library and Version History pages — given a `DocumentType` and a version's raw JSON `content`, Zod-parses it against the matching schema and renders the matching View component read-only; falls back to a friendly "couldn't be read" message on a schema mismatch (defensive only — content is always agent-written) |
| `src/components/ui/{Button,Input,Label,Card,FormError}.tsx` | Shared primitives styled from the `@theme` tokens in `globals.css` |

### Source Files — Agents & parsing
| File | Purpose |
|------|---------|
| `src/lib/anthropic.ts` | Anthropic SDK client singleton + `CLAUDE_MODEL = "claude-opus-5"` constant |
| `src/types/intake.ts` | Zod schemas + inferred types for the 3 Intake Agent artifacts (`BriefClassification`, `PositionDocumentFields`, `ClarificationEmail`), plus `SetupChecklistSchema`/`SetupChecklist` (`{ items: string[] }` — added a real Zod schema in task 7.0 so Version History can safely re-validate a `CHECKLIST` version's content). `PositionDocumentFieldsSchema` is reused unchanged by the Clarification Extraction step (same shape in and out) |
| `src/types/triage.ts` | `DraftScopeDocumentSchema`/`DraftScopeDocument` — objectives, deliverables, milestones, rolesAndResponsibilities (contacts + capabilities), budget, assumptionsAndConstraints, `flaggedGaps` |
| `src/types/deliverables-services.ts` | `DeliverablesServicesDocumentSchema`/`DeliverablesServicesDocument` — deliverables, a **fixed object** (not an array) of the 6 Services capability rows (`experienceCreative`/`business`/`architecture`/`techAndData`/`orchestration` each `{involvement}`, plus `other` with an extra free-text `label`), `openQuestionsRisks`, `outstandingGapsCarriedForward`. Also exports `SERVICE_ROWS`, the 5-row `{key, label}` list the UI maps over for the fixed capabilities |
| `src/types/workflow.ts` | `WorkflowStep`/`StepStatus` types for the project page's step list and Stage Tracker, plus `STEP_KIND_BY_STAGE` (which of the 10 stages are `AGENT` runs vs `HUMAN_INPUT` touchpoints — presentation-only, no schema backing) |
| `src/types/documents.ts` | `DOCUMENT_TYPE_LABELS` (friendly name per `DocumentType`) and `DOCUMENT_TYPE_ORDER` (stage-order list) — shared by the Outputs Library and Version History pages |
| `src/services/agents/intake-agent.ts` | `classifyBrief`, `extractPositionFields`, `generateClarificationEmail` (each a real Claude call via `messages.parse()` + `zodOutputFormat()` structured output), `generateSetupChecklist` (pure, no AI — fixed template), `runIntakeAgent` (orchestrates all 3 Claude calls in sequence), `IntakeAgentError` |
| `src/services/agents/clarification-extraction.ts` | `extractClarificationUpdate(currentPositionDocument, clarificationNotes)` — one Claude call, moves resolved items between `whatWeKnow`/`whatWeNeedToFindOut`/`clientFlaggedOpenItems` rather than just appending. `ClarificationExtractionError` |
| `src/services/agents/triage-agent.ts` | `generateDraftScopeDocument(positionDocument)` — one Claude call, always produces a complete draft and carries every remaining gap into `flaggedGaps` rather than blocking on them. `TriageAgentError` |
| `src/services/agents/specialist-review-extraction.ts` | `extractDeliverablesAndServices(draftScopeDocument, specialistFeedback)` — one Claude call, marks unneeded capabilities "Not required.", gives "Other" a sensible label, carries forward unresolved `flaggedGaps` into `outstandingGapsCarriedForward`. `SpecialistReviewExtractionError` |
| `src/services/parsing/index.ts` | `parseDocumentToText(buffer, fileName)` — `.txt` read directly; `.docx`/`.pdf`/`.pptx` via `officeparser`'s `OfficeParser.parseOffice()` → `ast.to("text")`. Throws `UnsupportedBriefFormatError` for anything else |

All four agent modules follow the same shape: one typed error class wrapping `Anthropic.RateLimitError`/`APIError`, `messages.parse()` + `zodOutputFormat()` for structured output, `claude-opus-5`, and — deliberately — one Claude call per concern rather than decomposing further.

### Source Files — Data layer
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma Client singleton using `@prisma/adapter-pg` |
| `src/generated/prisma/*` | Generated Prisma Client output (gitignored) |
| `prisma/schema.prisma` | Full schema: taxonomy, Stage/ProjectStageStatus, Document/DocumentVersion (JSON content, typed in app code per `DocumentType`), `ChecklistItem` (`isComplete`/`completedAt` — sat unused since task 2.0 until task 7.4 wired up its Server Action), TouchpointNote, KnowledgeItem, User. `Project` also carries nullable summary fields: `jobCode`, `kickOffDate`, `targetCompletionDate`, `projectManagerId` (FK → `User`, `onDelete: SetNull`; reverse relation `User.projectsManaged`). No schema changes were needed for task 7.0 |
| `prisma.config.ts` | Loads `.env.local`, wires `DATABASE_URL`, `seed: "tsx prisma/seed.ts"` |
| `prisma/migrations/20260806190913_init/`, `.../20260807101251_add_project_summary_fields/` | Applied to the real Neon dev database |
| `prisma/seed.ts` | 10 Stages, Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth` (one Workstream each), demo Project (with sample job code/dates/PM), two demo Users. User upserts run before the demo Project upsert (needed so the project can set `projectManagerId`) |

### Directory scaffolding (still empty, `.gitkeep` placeholder)
`src/styles`

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `test` (`vitest run`), `test:watch` |
| `eslint.config.mjs` | Flat config + `eslint-config-prettier`. `@typescript-eslint/no-unused-vars` overridden with `argsIgnorePattern`/`varsIgnorePattern: "^_"` — Server Actions bound to `useActionState` must keep React's fixed `(prevState, formData)` signature even when an action doesn't need one or both |
| `vitest.config.mts` | Default `node` environment (for DB tests); component tests opt into `jsdom` per-file via `// @vitest-environment jsdom` |
| `tests/setup.ts` | Loads `.env.local`, registers `@testing-library/jest-dom` matchers, **and a manual `afterEach(cleanup)`** — required because RTL's auto-cleanup needs `test.globals: true`, which this project doesn't use |
| `src/app/globals.css` | Tailwind v4 `@theme` design tokens: `background`/`surface`/`border`/`primary`/`accent`/`success`/`warning`/`danger` + `muted-foreground`/`ring`. Deliberate single light palette, no dark mode yet |
| `.gitignore` | Standard Next.js ignores + `/src/generated/prisma` + env-file rules |
| `.env.local.example` / `.env.local` | `DATABASE_URL` and `ANTHROPIC_API_KEY` are **real and working**. `NEXTAUTH_SECRET` is still a placeholder |
| `AGENTS.md`, `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/` | Auto-installed version-matched docs (Next.js, Prisma) — kept intentionally |
| `.claude/launch.json` | Dev-server launch config for the Browser preview tool (`npm run dev`, port 3000) |

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `tests/schema.test.ts` | 9 — DB constraints/relations against real Neon dev DB | ✅ passing |
| `tests/components/WorkflowStepList.test.tsx` | 3 — default-expands first non-complete step, status labels, click-to-toggle | ✅ passing |
| `tests/components/StageTracker.test.tsx` | 3 — every stage name renders, complete stages show a check mark, stages 6-10 labeled "Later" | ✅ passing |
| `tests/components/ProjectWorkflow.test.tsx` | 7 — Step 3 form vs. read-only-notes branching, Step 4 waiting/button/document-view branching, Step 5 feedback-form vs. read-only-feedback + Deliverables/Services Document branching. Mocks `.../[projectId]/actions` to avoid pulling in Prisma/auth | ✅ passing |
| `tests/components/EditableChecklist.test.tsx` | 4 — renders checked state per item, strikethrough on complete items, submits the toggle action on click, empty-state message | ✅ passing |
| `tests/components/DocumentVersionContent.test.tsx` | 5 — renders the correct View per `DocumentType`, "Other" label not editable, friendly message on unreadable content | ✅ passing |
| `tests/components/ChatPanel.test.tsx` | 1 — renders project name, input is disabled | ✅ passing |
| `tests/components/Sidebar.test.tsx` | 1 — nav renders with correct link | ✅ passing |
| `tests/components/LoginForm.test.tsx` | 2 — renders fields, shows mocked action's error message | ✅ passing |
| `tests/components/ProjectSummaryBar.test.tsx` | 4 — "Not yet set" fallbacks, real values render, Edit shows pre-filled form, Cancel discards | ✅ passing |
| `tests/components/EditableOtherLabel.test.tsx` | 3 — renders label as click-to-edit button, switches to editable input on click, Cancel discards without saving | ✅ passing |
| `tests/services/intake-agent.test.ts` | 7 — each Claude call, error wrapping, checklist (no API call), full orchestration | ✅ passing |
| `tests/services/clarification-extraction.test.ts` | 3 — returns updated fields, no-parsed-output error, unexpected-error wrapping | ✅ passing |
| `tests/services/triage-agent.test.ts` | 3 — always produces output with gaps flagged, no-parsed-output error, unexpected-error wrapping | ✅ passing |
| `tests/services/specialist-review-extraction.test.ts` | 3 — returns parsed document with all six service rows present, no-parsed-output error, unexpected-error wrapping | ✅ passing |
| `tests/services/parsing.test.ts` | 5 — `.txt` direct read, `.docx`/`.pdf`/`.pptx` via mocked `officeparser`, unsupported-extension rejection | ✅ passing |

63 tests total. Neither Outputs Library page nor the Version History page is unit-tested directly — matching this codebase's existing convention of not testing Server Components that call Prisma directly (only `tests/schema.test.ts` touches the real DB); their shared rendering logic (`DocumentVersionContent`) is tested instead. `@anthropic-ai/sdk` is fully mocked in every agent test per CLAUDE.md — no real API calls in the suite.

## Key Dependencies
- `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4
- `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `pg`, `dotenv`
- `next-auth` ^5.0.0-beta.32, `bcryptjs`, `zod` ^4
- `@anthropic-ai/sdk`, `officeparser` (handles docx/pdf/pptx parsing in one library — replaced the originally-installed `mammoth`/`pdf-parse`)
- Dev/test: `typescript`, `eslint` + `eslint-config-next` + `eslint-config-prettier`, `prettier`, `vitest`, `tsx`, `@testing-library/react` + `jest-dom` + `user-event`, `jsdom`
- `package.json` `overrides`: `pdfjs-dist` pinned to `6.2.108` (patched) — `officeparser@7.5.1` pins it to the vulnerable `6.1.200` internally (high-severity arbitrary-JS-execution advisory on malicious PDF input, directly relevant to our brief-upload attack surface). Don't remove this override without confirming a newer `officeparser` release no longer needs it.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY` — real, working, in `.env.local` (gitignored). `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — still placeholders. Templated in `.env.local.example` (committed).

## Toolchain Notes (this machine — see `progress.md` for full detail)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64` (no admin rights for the standard installer). Prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands (`migrate`, `db execute`, `db seed`, `db pull`, `studio`) require WSL** on this machine (unsigned native binary blocked by endpoint security). `npm run dev`, `npm test`, `npm run build`, `npx prisma generate` all work fine natively on Windows. See `progress.md`'s task 2.0 notes for the exact WSL command template.
- **After any `npm install` from WSL, immediately run `npm install` again from native Windows before doing anything else.** Windows/Linux optional-dependency native binaries (`esbuild`, `rolldown`, `@prisma/engines`) do not reliably coexist — a WSL-side install can silently drop the Windows binary Vitest/tsx need.

## Current State Summary
Tasks 1.0–7.0 are complete, plus two ad-hoc additions done at the user's request: a project-page restructure (step-console UI, between tasks 4.0 and 5.0) and a project summary bar (Job Code/Kick-off/Target Completion/PM, after task 5.0). The pipeline now works end-to-end through Stage 6: paste/upload a brief → Intake Agent → clarification notes → Clarification Extraction → Triage Agent → specialist-lead feedback → Specialist Review Extraction → Stage 6 unlocked. On top of the pipeline itself, the project page now also shows a compact Stage Tracker, every artifact is browsable via a dedicated Outputs Library + per-artifact Version History, and the Set-Up Checklist's tick-boxes are genuinely interactive and persisted. Every feature has been verified in the browser against the real Claude API and real Neon database, not just typechecked — including catching and fixing a real page-level horizontal-overflow bug in the dashboard shell (`min-w-0` on `main`) that only showed up when actually loading the new Stage Tracker in-browser. Typecheck, lint, full test suite (63 tests, Anthropic API fully mocked per CLAUDE.md), and production build all pass. Next up: task 8.0 — Ad-hoc Knowledge Upload & Project Brain Chatbot, the first task requiring the `project_id`-filtered chatbot isolation CLAUDE.md calls out as a hard, explicitly-tested requirement.
