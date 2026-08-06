# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. The full data schema, core UI shell, and the first live AI agent (Intake Agent) are built and verified end-to-end in the browser against the real Claude API and real Neon database. Stages 1-2 of the pipeline work fully; Stages 3-5, the chatbot, and knowledge upload are not yet built.

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
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail — breadcrumb, `notFound()` on bad id, fetches Documents/latest DocumentVersions/ChecklistItems, passes parsed+validated artifacts into `ProjectDetailTabs` |
| `src/components/layout/Header.tsx` | Server Component; shows session user + role, inline Server Action sign-out form |
| `src/components/layout/Sidebar.tsx` | Primary nav (currently just "All Projects") |
| `src/components/layout/Footer.tsx` | Static footer |
| `src/components/features/ProjectDetailTabs.tsx` | Client Component; 4 tabs. **Outputs Library is real** (renders the 3 Intake Agent artifacts); Stage Tracker/Chatbot/Knowledge Upload remain placeholders pending tasks 7.0/8.0 |
| `src/components/features/{ClarificationEmailView,PositionDocumentView,ChecklistView}.tsx` | Presentational renderers for the 3 artifact types, each taking already-validated typed data as props |
| `src/components/ui/{Button,Input,Label,Card,FormError}.tsx` | Shared primitives styled from the `@theme` tokens in `globals.css` |

### Source Files — Agents & parsing
| File | Purpose |
|------|---------|
| `src/lib/anthropic.ts` | Anthropic SDK client singleton + `CLAUDE_MODEL = "claude-opus-5"` constant |
| `src/types/intake.ts` | Zod schemas + inferred types for all 3 Intake Agent artifacts (`BriefClassification`, `PositionDocumentFields`, `ClarificationEmail`) plus the fixed `SetupChecklist` |
| `src/services/agents/intake-agent.ts` | `classifyBrief`, `extractPositionFields`, `generateClarificationEmail` (each a real Claude call via `messages.parse()` + `zodOutputFormat()` structured output), `generateSetupChecklist` (pure, no AI — fixed template), `runIntakeAgent` (orchestrates all 3 Claude calls in sequence), `IntakeAgentError` (user-friendly wrapper around SDK errors) |
| `src/services/parsing/index.ts` | `parseDocumentToText(buffer, fileName)` — `.txt` read directly; `.docx`/`.pdf`/`.pptx` via `officeparser`'s `OfficeParser.parseOffice()` → `ast.to("text")`. Throws `UnsupportedBriefFormatError` for anything else |

### Source Files — Data layer
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma Client singleton using `@prisma/adapter-pg` |
| `src/generated/prisma/*` | Generated Prisma Client output (gitignored) |
| `prisma/schema.prisma` | Full schema: taxonomy, Stage/ProjectStageStatus, Document/DocumentVersion (JSON content, typed in app code per `DocumentType` — the same Zod schemas in `src/types/intake.ts`), ChecklistItem, TouchpointNote, KnowledgeItem, User |
| `prisma.config.ts` | Loads `.env.local`, wires `DATABASE_URL`, `seed: "tsx prisma/seed.ts"` |
| `prisma/migrations/20260806190913_init/` | Initial migration, applied to the real Neon dev database |
| `prisma/seed.ts` | 10 Stages, Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth` (one Workstream each), demo Project, two demo Users |

### Directory scaffolding (still empty, `.gitkeep` placeholder)
`src/styles`

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `test` (`vitest run`), `test:watch` |
| `vitest.config.mts` | Default `node` environment (for DB tests); component tests opt into `jsdom` per-file via `// @vitest-environment jsdom` |
| `tests/setup.ts` | Loads `.env.local`, registers `@testing-library/jest-dom` matchers, **and a manual `afterEach(cleanup)`** — required because RTL's auto-cleanup needs `test.globals: true`, which this project doesn't use |
| `src/app/globals.css` | Tailwind v4 `@theme` design tokens: `background`/`surface`/`border`/`primary`/`accent`/`success`/`warning`/`danger` + `muted-foreground`/`ring`. Deliberate single light palette, no dark mode yet |
| `.gitignore` | Standard Next.js ignores + `/src/generated/prisma` + env-file rules |
| `.env.local.example` / `.env.local` | `DATABASE_URL` and `ANTHROPIC_API_KEY` are **real and working**. `NEXTAUTH_SECRET` is still a placeholder |
| `AGENTS.md`, `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/` | Auto-installed version-matched docs (Next.js, Prisma) — kept intentionally |

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `tests/schema.test.ts` | 9 — DB constraints/relations against real Neon dev DB | ✅ passing |
| `tests/components/ProjectDetailTabs.test.tsx` | 4 — default tab, switching, all tabs render, real artifact rendering | ✅ passing |
| `tests/components/Sidebar.test.tsx` | 1 — nav renders with correct link | ✅ passing |
| `tests/components/LoginForm.test.tsx` | 2 — renders fields, shows mocked action's error message | ✅ passing |
| `tests/services/intake-agent.test.ts` | 7 — each Claude call, error wrapping, checklist (no API call), full orchestration. `@anthropic-ai/sdk` fully mocked — no real API calls in the suite | ✅ passing |
| `tests/services/parsing.test.ts` | 5 — `.txt` direct read, `.docx`/`.pdf`/`.pptx` via mocked `officeparser`, unsupported-extension rejection | ✅ passing |

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
Tasks 1.0–4.0 are complete. The Intake Agent (classify → extract → draft email, all real Claude Opus 5 calls with `output_config.format` structured outputs validated against Zod schemas) is wired end-to-end: paste/upload a brief on `/projects/new` → parsed to text → Intake Agent runs → Project + Documents/DocumentVersions + ChecklistItems created in one transaction → Stage 1→2 transition → redirect to Project Detail, where the Outputs Library tab renders the real Clarification Email, Position Document, and Checklist. Verified in-browser against the real API and real database, not just typechecked. Typecheck, lint, full test suite (28 tests, Anthropic API fully mocked in the suite per CLAUDE.md), and production build all pass. Next up: task 5.0 — freeform client-clarification-notes capture, the Clarification Extraction step (Position Document + notes → updated fields, versioned), and the Triage Agent producing the Draft Scope Document.
