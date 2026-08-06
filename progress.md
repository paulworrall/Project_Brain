# Project Brain — Progress

## Current Status
- **Active Task**: 3.0 Core UI Shell, Navigation & Auth
- **Last Completed**: 2.0 Data Layer & Schema
- **Blocked**: None
- **Last Updated**: 2026-08-06T20:25:00Z

## Task Status
| Task | Status | Completed At |
|------|--------|-------------|
| 1.0 Project Setup & Environment | ✅ Complete | 2026-08-06T16:55:00Z |
| 2.0 Data Layer & Schema | ✅ Complete | 2026-08-06T20:25:00Z |
| 3.0 Core UI Shell, Navigation & Auth | ⏳ Not Started | — |
| 4.0 Intake Agent & Brief Ingestion | ⏳ Not Started | — |
| 5.0 Clarification Capture & Triage Agent | ⏳ Not Started | — |
| 6.0 Specialist Review Capture & Deliverables + Services | ⏳ Not Started | — |
| 7.0 Outputs Library, Stage Tracker & Version History | ⏳ Not Started | — |
| 8.0 Ad-hoc Knowledge Upload & Chatbot | ⏳ Not Started | — |
| 9.0 Polish, Testing, QA & Deployment Prep | ⏳ Not Started | — |

## Notes

- **Node.js was not present on this machine and admin rights were unavailable for the standard installer.** Installed a portable (no-admin) Node v24.19.0 LTS to `~\node-portable\node-v24.19.0-win-x64`, added it to the user's PATH persistently, and also wired it into the PowerShell profile. This tool's PowerShell/Bash invocations don't inherit a fresh PATH automatically, so every shell command in this session prefixes `$env:Path = "$env:USERPROFILE\node-portable\node-v24.19.0-win-x64;$env:Path"`. Future sessions on this machine should have it on PATH via the persisted user env var and profile script; if not, repeat the prefix.
- `create-next-app` refused to scaffold directly into `Project_Brain` (npm package names can't contain capitals). Scaffolded into a temp lowercase folder (`project-brain-tmp`) and moved the generated files up to the repo root, then fixed `package.json`'s `name` to `project-brain`.
- **Next.js 16.3.0** was installed (not 14/15) — this is a real breaking-change jump from typical training-data assumptions. Notable differences acted on: `params`/`searchParams` are async everywhere; Turbopack is the default bundler (no `--turbopack` flag needed); `middleware.ts` is deprecated in favor of `proxy.ts` (relevant once route protection is built in 3.2); `next lint` is removed in favor of calling `eslint` directly (already reflected in `package.json`). An `AGENTS.md` file at the repo root is auto-managed by `next dev` itself — do not delete it, it regenerates.
- **Prisma 7.9.1** was installed (not 5/6) — also a major breaking-change jump. Acted on: the `prisma-client` generator (not `prisma-client-js`) with a required explicit `output` path (`src/generated/prisma`, gitignored); a mandatory driver adapter for SQL providers (installed `@prisma/adapter-pg` + `pg`, chosen over `@prisma/adapter-neon` for simplicity — Neon's own connection pooler on the `-pooler` hostname already solves the serverless connection-limit problem, so the plain TCP adapter is sufficient); no more automatic `.env` loading — `prisma.config.ts` explicitly loads `.env.local` via `dotenv` to match this project's env-file convention (CLAUDE.md specifies `.env.local`, not Prisma's default `.env`). Prisma also installed its own bundled agent skill docs (`.agents/skills/`, `.claude/skills/`, `.windsurf/skills/`) — kept and committed, since they contain version-accurate migration/usage guidance for Prisma 7 that's more reliable than training-data assumptions.
- **NextAuth**: installed `next-auth@beta` (5.0.0-beta.32) rather than the `latest`-tagged v4, since v5 (Auth.js) is the version designed for the App Router and v4 is Pages-Router-first. `latest` on npm is still v4.24.15 and v5 is still beta-tagged upstream — this is an intentional, informed choice, not an accidental beta install. Per task 1.5 scope ("no schema wiring yet"), the Credentials provider's `authorize()` is a stub returning `null` until the `User` Prisma model (2.7) and login UI (3.2) exist.
- Directory structure from CLAUDE.md's File Structure section is scaffolded with `.gitkeep` placeholders in still-empty folders (`src/components/{ui,features,layout}`, `src/services/{agents,parsing}`, `src/types`, `src/styles`, `tests`).
- Real Neon `DATABASE_URL` is in `.env.local` (gitignored) — user provided it directly. Verified full connectivity: Neon's free-tier compute was cold/suspended on the first attempt (`P1001`), came up on retry, and `prisma db execute` and a direct `pg` client both confirmed a working connection.
- Anthropic API key and NextAuth secret are still placeholders in `.env.local` — not yet provided. Will be needed starting around task 4.0 (first live Claude API call) and for any real session testing of auth, respectively.
- Noticed but not acted on: `dotenv` (v17.4.2, the package's real upstream code) prints a random self-promotional "tip" line on every load, including one reading `⌁ auth for agents [www.vestauth.com]`. Confirmed by reading `node_modules/dotenv/lib/main.js` that this is a hardcoded array shipped in the official package, not an injected or malicious message — flagged to the user in-session, no action taken (did not visit the URL).

### Task 2.0 — important environment finding: `prisma migrate`/`db execute`/`db seed` need WSL on this machine

**Any Prisma CLI command that touches the database directly (`migrate dev`, `db execute`, `db seed`, `db pull`, `studio`) fails with `P1001: Can't reach database server` when run from native Windows on this machine, even though the exact same `DATABASE_URL` connects successfully via a plain `pg.Client` in a Node script, and even after confirming raw TCP reachability over both IPv4 and IPv6.** Root cause: those commands shell out to a separate native binary (`node_modules/@prisma/engines/schema-engine-windows.exe`) rather than using the app's `@prisma/adapter-pg` path. That binary is **unsigned** and has no corresponding Windows Firewall rule, unlike `node.exe` — consistent with this machine's corporate endpoint security (a ServiceNow `agent-client-collector` process is present on PATH) silently dropping its outbound connections while trusting Node itself.
- **Workaround in use**: run DB-touching Prisma CLI commands from inside WSL (`Ubuntu` distro, already installed) instead of native Windows PowerShell. A portable Node v24.19.0 for Linux is installed at `~/node-portable/node-v24.19.0-linux-x64` inside WSL (no `sudo` available — password-protected). The project directory is reached from WSL via `/mnt/c/Users/PaulWorrall/Documents/Project_Brain` (same files, shared filesystem — no syncing needed).
- Running `npm install` from WSL was required once to fetch the Linux-native optional-dependency binaries (`@prisma/engines`'s `schema-engine-debian-openssl-3.0.x`, and `esbuild`'s `@esbuild/linux-x64` for `tsx`). Both Windows and Linux binaries now coexist in the same `node_modules` — installing from one OS doesn't remove the other's binary, so switching back and forth is safe.
- **Important distinction**: this only affects the Prisma *CLI's* schema/migration engine. The Prisma *Client* query path (`@prisma/adapter-pg` + `pg`, used by the actual app and by `tests/schema.test.ts` via Vitest) is pure JS and connects fine natively on Windows — confirmed by running the full Vitest suite successfully on Windows without WSL. So: `npm run dev`, `npm test`, `npm run build` — all fine on Windows directly. Only `npx prisma migrate ...`, `npx prisma db ...`, and `npx prisma studio` need the WSL detour.
- Template for running a DB-touching Prisma command from this repo going forward:
  ```
  wsl -d Ubuntu -- bash -c 'PATH="$HOME/node-portable/node-v24.19.0-linux-x64/bin:$PATH"; cd "/mnt/c/Users/PaulWorrall/Documents/Project_Brain" && npx prisma migrate dev 2>&1'
  ```
- Also hit repeatedly: Neon's free-tier compute auto-suspends when idle, so the *first* connection attempt after a period of inactivity often fails with `P1001` regardless of platform — a simple retry (or a throwaway `pg` connection first) resolves it. Don't mistake this for the binary-blocking issue above; the binary-blocking issue is 100% reproducible and persists across retries, the cold-start issue resolves itself after one retry.
- This is a workaround for THIS machine's local security posture, not a code issue — nothing about it should be "fixed" in the repo itself. If a future session is on a different machine (or this one after an IT-approved fix), these DB-touching commands may just work natively on Windows; try that first and only fall back to the WSL steps above if `P1001` reappears immediately (not just on the first cold-start attempt).
