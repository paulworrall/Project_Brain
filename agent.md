# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. The full data schema is migrated and seeded, and the core UI shell (auth, taxonomy browser, project detail shell, route protection) is built and verified end-to-end in the browser. No AI agents exist yet — that starts at task 4.0.

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
| `src/app/(dashboard)/page.tsx` | Taxonomy browser (`/`) — Server Component, real Prisma query, Hub → Client → Workstream → Project nested cards with Stage badges |
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Project Detail shell — breadcrumb, `notFound()` on bad id, renders `ProjectDetailTabs` |
| `src/components/layout/Header.tsx` | Server Component; shows session user + role, inline Server Action sign-out form |
| `src/components/layout/Sidebar.tsx` | Primary nav (currently just "All Projects") |
| `src/components/layout/Footer.tsx` | Static footer |
| `src/components/features/ProjectDetailTabs.tsx` | Client Component; 4 tabs (Stage Tracker / Outputs Library / Chatbot / Knowledge Upload), each a placeholder pending tasks 7.0/8.0 |
| `src/components/ui/{Button,Input,Label,Card,FormError}.tsx` | Shared primitives styled from the `@theme` tokens in `globals.css` |

### Source Files — Data layer
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma Client singleton using `@prisma/adapter-pg` |
| `src/generated/prisma/*` | Generated Prisma Client output (gitignored) |
| `prisma/schema.prisma` | Full schema: taxonomy, Stage/ProjectStageStatus, Document/DocumentVersion (JSON content, typed in app code per `DocumentType`), ChecklistItem, TouchpointNote, KnowledgeItem, User |
| `prisma.config.ts` | Loads `.env.local`, wires `DATABASE_URL`, `seed: "tsx prisma/seed.ts"` |
| `prisma/migrations/20260806190913_init/` | Initial migration, applied to the real Neon dev database |
| `prisma/seed.ts` | 10 Stages, Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth` (one Workstream each), demo Project, two demo Users |

### Directory scaffolding (still empty, `.gitkeep` placeholders)
`src/services/{agents,parsing}`, `src/styles`

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `test` (`vitest run`), `test:watch` |
| `vitest.config.mts` | Default `node` environment (for DB tests); component tests opt into `jsdom` per-file via `// @vitest-environment jsdom` |
| `tests/setup.ts` | Loads `.env.local`, registers `@testing-library/jest-dom` matchers, **and a manual `afterEach(cleanup)`** — required because RTL's auto-cleanup needs `test.globals: true`, which this project doesn't use |
| `src/app/globals.css` | Tailwind v4 `@theme` design tokens: `background`/`surface`/`border`/`primary`/`accent`/`success`/`warning`/`danger` + `muted-foreground`/`ring`. Deliberate single light palette, no dark mode yet |
| `.gitignore` | Standard Next.js ignores + `/src/generated/prisma` + env-file rules |
| `.env.local.example` / `.env.local` | `DATABASE_URL` (real, working), `ANTHROPIC_API_KEY`/`NEXTAUTH_SECRET` (still placeholders) |
| `AGENTS.md`, `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/` | Auto-installed version-matched docs (Next.js, Prisma) — kept intentionally |

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `tests/schema.test.ts` | 9 — DB constraints/relations against real Neon dev DB | ✅ passing |
| `tests/components/ProjectDetailTabs.test.tsx` | 3 — default tab, switching, all tabs render | ✅ passing |
| `tests/components/Sidebar.test.tsx` | 1 — nav renders with correct link | ✅ passing |
| `tests/components/LoginForm.test.tsx` | 2 — renders fields, shows mocked action's error message | ✅ passing |

## Key Dependencies
- `next` 16.3.0, `react`/`react-dom` 19.2.8, `tailwindcss` ^4
- `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `pg`, `dotenv`
- `next-auth` ^5.0.0-beta.32, `bcryptjs`, `zod` ^4
- Dev/test: `typescript`, `eslint` + `eslint-config-next` + `eslint-config-prettier`, `prettier`, `vitest`, `tsx`, `@testing-library/react` + `jest-dom` + `user-event`, `jsdom`

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — in `.env.local` (gitignored), templated in `.env.local.example` (committed).

## Toolchain Notes (this machine — see `progress.md` for full detail)
- Portable Node v24.19.0 at `~\node-portable\node-v24.19.0-win-x64` (no admin rights for the standard installer). Prefix shell commands with `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"` if `node`/`npm` aren't found.
- **DB-touching Prisma CLI commands (`migrate`, `db execute`, `db seed`, `db pull`, `studio`) require WSL** on this machine (unsigned native binary blocked by endpoint security). `npm run dev`, `npm test`, `npm run build`, `npx prisma generate` all work fine natively on Windows. See `progress.md`'s task 2.0 notes for the exact WSL command template.

## Current State Summary
Tasks 1.0–3.0 are complete. Verified in-browser end-to-end: login (success + failure), signup (creates real `User`, auto-signs-in), sign-out, route protection redirects both directions, taxonomy browser rendering real seeded data, project detail page with working tab switching, 404 on unknown project id. Typecheck, lint, full test suite (15 tests), and production build all pass. Next up: task 4.0 — brief upload/paste UI, document parsing utilities (docx/pdf/pptx), and the Intake Agent (classification + extraction calls to Claude) producing the Clarification Email, Position Document, and Set-Up Checklist.
