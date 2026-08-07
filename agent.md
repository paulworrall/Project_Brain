# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. The full data schema and two live AI agent pipelines (Intake, Clarification Extraction + Triage) are built and verified end-to-end in the browser against the real Claude API and real Neon database. The project page is a single-view "workflow console" — a numbered, expandable step list (all 10 pipeline stages) beside a chat/knowledge-upload sidebar. Stages 1-4 of the pipeline work fully; Stage 5 is unlocked (ready for its own task) but not yet built; Stages 6-10, the chatbot, and knowledge upload render as inert placeholders.

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
| `src/app/(dashboard)/layout.tsx` | Header + Sidebar + Footer shell for all authenticated routes |
| `src/app/(dashboard)/page.tsx` | Taxonomy browser (`/`) — Server Component, real Prisma query, Hub → Client → Workstream → Project nested cards with Stage badges, "+ New Project" link |
| `src/app/(dashboard)/projects/new/page.tsx` + `NewProjectForm.tsx` + `actions.ts` | Project creation: pick a Workstream, name the project, paste or upload a brief (.docx/.pdf/.pptx/.txt). Server Action parses the brief, runs the full Intake Agent, persists everything in one transaction, redirects to the new Project Detail page |
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — breadcrumb, `notFound()` on bad id, fetches Documents/latest DocumentVersions/ChecklistItems/latest `CLARIFICATION_REPLY` TouchpointNote and all 10 Stage rows with this project's own ProjectStageStatus, passes everything into `ProjectWorkflow` |
| `src/app/(dashboard)/projects/[projectId]/actions.ts` | `submitClarificationNotesAction` (Step 3 — extraction + Position Doc versioning + Stage 2/3 complete, Stage 4 unlocked) and `runTriageAgentAction` (Step 4 — Draft Scope Document + Stage 4 complete, Stage 5 unlocked). Both `(projectId, prevState, formData)`, called via `.bind(null, projectId)` from their client components, both use `revalidatePath` (not `redirect`) since they mutate the current page rather than navigating away |
| `src/components/layout/Header.tsx` | Server Component; shows session user + role, inline Server Action sign-out form |
| `src/components/layout/Sidebar.tsx` | Primary nav (currently just "All Projects") |
| `src/components/layout/Footer.tsx` | Static footer |
| `src/components/features/ProjectWorkflow.tsx` | Server Component — the project page's main content. Builds a `content: ReactNode` per stage (real artifacts for stages 1-4, "Coming in task X.X" placeholders for 5-10) and lays out the two-column grid: step list + sticky chat sidebar. Replaced the tab-based `ProjectDetailTabs.tsx` on 2026-08-07 at the user's request — see `progress.md`'s "Ad-hoc UI restructure" note |
| `src/components/features/WorkflowStepList.tsx` | Client Component — the numbered step list itself. One step expanded at a time (defaults to the first non-`COMPLETE` stage **at mount**, then preserved as local state — it does not recompute on prop changes, so a step stays open across a `revalidatePath` refresh even after its status changes), status badge (Pending/In Progress/Complete) + step-kind subtitle (AI Agent vs Human Input, from `STEP_KIND_BY_STAGE` in `src/types/workflow.ts`) |
| `src/components/features/ChatPanel.tsx` | Static sidebar placeholder — project-scoped chatbot (tasks 8.3-8.4) + knowledge upload (8.1-8.2), both disabled/labeled "coming in task X.X" |
| `src/components/features/{ClarificationEmailView,PositionDocumentView,ChecklistView}.tsx` | Presentational renderers for the 3 Intake Agent artifact types (task 4.0, unchanged) |
| `src/components/features/ClarificationNotesForm.tsx` | Step 3 Client Component — textarea + submit, bound to `submitClarificationNotesAction`. `ProjectWorkflow` swaps this for read-only notes + the updated Position Document once a `CLARIFICATION_REPLY` TouchpointNote exists |
| `src/components/features/RunTriageAgentButton.tsx` | Step 4 Client Component — button bound to `runTriageAgentAction`, shown only while Stage 4 is `IN_PROGRESS` and no Draft Scope Document exists yet |
| `src/components/features/DraftScopeDocumentView.tsx` | Renders the Draft Scope Document — `flaggedGaps` in a warning-styled card **above** the rest of the document (the PRP's "flagged clearly" requirement, taken literally, not buried at the bottom) |
| `src/components/ui/{Button,Input,Label,Card,FormError}.tsx` | Shared primitives styled from the `@theme` tokens in `globals.css` |

### Source Files — Agents & parsing
| File | Purpose |
|------|---------|
| `src/lib/anthropic.ts` | Anthropic SDK client singleton + `CLAUDE_MODEL = "claude-opus-5"` constant |
| `src/types/intake.ts` | Zod schemas + inferred types for the 3 Intake Agent artifacts (`BriefClassification`, `PositionDocumentFields`, `ClarificationEmail`) plus the fixed `SetupChecklist`. `PositionDocumentFieldsSchema` is reused unchanged by the Clarification Extraction step (same shape in and out) |
| `src/types/triage.ts` | `DraftScopeDocumentSchema`/`DraftScopeDocument` — objectives, deliverables, milestones, rolesAndResponsibilities (contacts + capabilities), budget, assumptionsAndConstraints, `flaggedGaps` |
| `src/types/workflow.ts` | `WorkflowStep`/`StepStatus` types for the project page's step list, plus `STEP_KIND_BY_STAGE` (which of the 10 stages are `AGENT` runs vs `HUMAN_INPUT` touchpoints — presentation-only, no schema backing) |
| `src/services/agents/intake-agent.ts` | `classifyBrief`, `extractPositionFields`, `generateClarificationEmail` (each a real Claude call via `messages.parse()` + `zodOutputFormat()` structured output), `generateSetupChecklist` (pure, no AI — fixed template), `runIntakeAgent` (orchestrates all 3 Claude calls in sequence), `IntakeAgentError` |
| `src/services/agents/clarification-extraction.ts` | `extractClarificationUpdate(currentPositionDocument, clarificationNotes)` — one Claude call, moves resolved items between `whatWeKnow`/`whatWeNeedToFindOut`/`clientFlaggedOpenItems` rather than just appending. `ClarificationExtractionError` |
| `src/services/agents/triage-agent.ts` | `generateDraftScopeDocument(positionDocument)` — one Claude call, always produces a complete draft and carries every remaining gap into `flaggedGaps` rather than blocking on them. `TriageAgentError` |
| `src/services/parsing/index.ts` | `parseDocumentToText(buffer, fileName)` — `.txt` read directly; `.docx`/`.pdf`/`.pptx` via `officeparser`'s `OfficeParser.parseOffice()` → `ast.to("text")`. Throws `UnsupportedBriefFormatError` for anything else |

All three agent modules follow the same shape: one typed error class wrapping `Anthropic.RateLimitError`/`APIError`, `messages.parse()` + `zodOutputFormat()` for structured output, `claude-opus-5`, and — deliberately — one Claude call per concern rather than decomposing further (Position Document/Checklist/Draft Scope Document generation don't need their own extra calls beyond what's listed above).

### Source Files — Data layer
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma Client singleton using `@prisma/adapter-pg` |
| `src/generated/prisma/*` | Generated Prisma Client output (gitignored) |
| `prisma/schema.prisma` | Full schema: taxonomy, Stage/ProjectStageStatus, Document/DocumentVersion (JSON content, typed in app code per `DocumentType` — the Zod schemas in `src/types/intake.ts` and `src/types/triage.ts`), ChecklistItem, TouchpointNote, KnowledgeItem, User |
| `prisma.config.ts` | Loads `.env.local`, wires `DATABASE_URL`, `seed: "tsx prisma/seed.ts"` |
| `prisma/migrations/20260806190913_init/` | Initial migration, applied to the real Neon dev database |
| `prisma/seed.ts` | 10 Stages, Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth` (one Workstream each), demo Project, two demo Users |

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
| `tests/components/ProjectWorkflow.test.tsx` | 5 — Step 3 form vs. read-only-notes branching, Step 4 waiting/button/document-view branching. Mocks `.../[projectId]/actions` to avoid pulling in Prisma/auth | ✅ passing |
| `tests/components/ChatPanel.test.tsx` | 1 — renders project name, input is disabled | ✅ passing |
| `tests/components/Sidebar.test.tsx` | 1 — nav renders with correct link | ✅ passing |
| `tests/components/LoginForm.test.tsx` | 2 — renders fields, shows mocked action's error message | ✅ passing |
| `tests/services/intake-agent.test.ts` | 7 — each Claude call, error wrapping, checklist (no API call), full orchestration | ✅ passing |
| `tests/services/clarification-extraction.test.ts` | 3 — returns updated fields, no-parsed-output error, unexpected-error wrapping | ✅ passing |
| `tests/services/triage-agent.test.ts` | 3 — always produces output with gaps flagged, no-parsed-output error, unexpected-error wrapping | ✅ passing |
| `tests/services/parsing.test.ts` | 5 — `.txt` direct read, `.docx`/`.pdf`/`.pptx` via mocked `officeparser`, unsupported-extension rejection | ✅ passing |

`@anthropic-ai/sdk` is fully mocked in every agent test per CLAUDE.md — no real API calls in the suite.

## Key Dependencies
- `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4
- `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `pg`, `dotenv`
- `next-auth` ^5.0.0-beta.32, `bcryptjs`, `zod` ^4
- `@anthropic-ai/sdk`, `officeparser` (handles docx/pdf/pptx parsing in one library — replaced the originally-installed `mammoth`/`pdf-parse`)
- Dev/test: `typescript`, `eslint` + `eslint-config-next` + `eslint-config-prettier`, `prettier`, `vitest`, `tsx`, `@testing-library/react` + `jest-dom` + `user-event`, `jsdom`

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY` — real, working, in `.env.local` (gitignored). `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — still placeholders. Templated in `.env.local.example` (committed).

## Toolchain Notes (this machine — see `progress.md` for full detail)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64` (no admin rights for the standard installer). Prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands (`migrate`, `db execute`, `db seed`, `db pull`, `studio`) require WSL** on this machine (unsigned native binary blocked by endpoint security). `npm run dev`, `npm test`, `npm run build`, `npx prisma generate` all work fine natively on Windows. See `progress.md`'s task 2.0 notes for the exact WSL command template.

## Current State Summary
Tasks 1.0–5.0 are complete, plus an ad-hoc project-page restructure (step-console UI, done between tasks 4.0 and 5.0 at the user's request). The pipeline now works end-to-end through Stage 5: paste/upload a brief → Intake Agent (classify/extract/draft email) → paste the client's reply → Clarification Extraction (versions the Position Document, resolving or carrying forward each item) → Triage Agent (Draft Scope Document, gaps flagged clearly) → Stage 5 unlocked. Every stage transition, document version, and piece of generated content has been verified in the browser against the real Claude API and real Neon database, not just typechecked — including the full Coffee "Loyalty App Relaunch" project run through Stage 1 to Stage 5 live. Typecheck, lint, full test suite (39 tests, Anthropic API fully mocked per CLAUDE.md), and production build all pass. Next up: task 6.0 — freeform specialist-lead feedback capture (Stage 5) and the Specialist Review Extraction step producing the Deliverables + Services Document. Its content should slot into `ProjectWorkflow.tsx`'s `contentByStage` map for stage 5, following the same "human input step → extraction/generation step" pattern established in task 5.0 (`ClarificationNotesForm`/`submitClarificationNotesAction` is the template to follow, not `RunTriageAgentButton`, since Stage 5 per CLAUDE.md's File Structure is `specialist-review-extraction.ts`, an extraction step directly off freeform notes rather than a separate two-step human-input-then-agent split).
