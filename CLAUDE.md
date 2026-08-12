# Project Brain — Implementation Guide for Claude Code

## Project Overview

Project Brain is an internal platform that makes the delivery, management, and communication of client projects more efficient. Claude-powered agents turn a client brief into a structured, staged workflow — generating key documents at each stage — while humans stay in control of every client- and specialist-facing conversation.

**Goal:** Build Stages 1-5 of the workflow (Intake → Get Clarifications → Triage → Review with Specialist Leads), plus a cross-cutting Knowledge Upload feature and a project-scoped Q&A chatbot.
**Type:** AI App (agentic document/workflow platform — not a chat/voice persona app)
**Demo/Production:** Real internal pilot, not a demo. Prioritize correctness of agent outputs and data integrity, alongside a genuinely good UX (adoption depends on it).

## Technical Stack
- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS (no existing design system — build clean/efficient/professional from scratch)
- **State Management:** React state / Server Components where possible; introduce a client store only if a specific screen genuinely needs one
- **Authentication:** NextAuth, email/password credentials provider (upgradeable to SSO later — do not build anything that blocks that)
- **Database/Backend:** PostgreSQL (hosted on Neon), Prisma ORM
- **AI Integration:** Anthropic Claude via the Anthropic API — direct calls from backend functions, no orchestration framework
- **Deployment:** Vercel
- **Key Libraries:**
  - `mammoth` or similar: docx parsing
  - `pdf-parse` or similar: pdf parsing
  - A pptx-text-extraction library: pptx parsing
  - Prisma Client: database access

## Architecture Decisions

### Key Constraints
- Every AI agent is a small, dedicated, testable module (`src/services/agents/*.ts`) — not a general-purpose autonomous agent
- Every agent returns **structured JSON** matching its artifact's defined fields — never free text the app has to parse
- Multi-step agent logic (e.g. classify-then-extract) is split into separate sequential Claude calls, not one large prompt
- Client-facing artifacts (the Clarification Email, and later the SOW) are **always drafts** — the app never sends anything on a user's behalf
- Documents version at **stage transitions**, not on every edit
- The chatbot's cross-project isolation is enforced by a `project_id` filter **at the database query layer** — never by prompting alone

### Data Flow
A `Project` sits under `Hub → Client → Workstream → Project`. It moves through `Stage`s (1-5 active for MVP; 6-10 modeled but not built yet). Each Stage transition can produce a `Document` (versioned via `DocumentVersion`), can require a `TouchpointNote` (freeform human input), and updates `ProjectStageStatus`. `KnowledgeItem`s and the chatbot sit alongside this pipeline, scoped to the `Project` but independent of its current Stage.

### Phase Presentation Layer (added after initial build started — additive, not a schema change)
Stages remain the source of truth for tracking/versioning — nothing above changes. But the Stage Tracker UI must NOT show 10 flat, individually-named stages by default — that reads as an engineering decomposition, not how a user thinks about the work. Instead:
- A static config file (`src/lib/phases.ts`) groups Stages into 3 Phases: **"Clarifying the brief and scope"** (Stages 1-4), **"Estimation and team planning"** (Stages 5-7), **"Statement of work and delivery setup"** (Stages 8-9)
- Stage 10 (Commercial Status) is explicitly **not** part of any Phase — model it as a separate **"Delivery Monitoring"** indicator, since it recurs continuously rather than completing once
- This is a plain TypeScript config object, NOT a new Prisma model or migration — do not add a `Phase` database table
- The Stage Tracker component reads this config to render 3 expandable Phase cards (collapsed by default except the active one) instead of a flat list of 10 stages

### Authentication Flow
Email/password via NextAuth. Two roles: `ClientEngagement`, `Delivery`. For MVP, both roles see the same views — do not build restrictive permissions yet, just record the role on `User`.

## File Structure
```
project-root/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/
│   │   ├── ui/                 # Reusable UI components
│   │   ├── features/           # Feature-specific components (StageTracker, DocumentViewer, Chatbot, etc.)
│   │   └── layout/              # Layout components
│   ├── services/
│   │   ├── agents/              # intake-agent.ts, triage-agent.ts, clarification-extraction.ts, specialist-review-extraction.ts, chatbot.ts
│   │   └── parsing/              # docx/pdf/pptx → plain text utilities
│   ├── lib/                     # Prisma client, auth config, utils
│   ├── types/                   # TypeScript types/interfaces
│   └── styles/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── public/
├── tests/
├── progress.md                  # Task progress tracker (agent-maintained)
├── agent.md                     # Codebase summary (agent-maintained)
├── .env.local.example
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## Implementation Sequence

### Phase 1: Foundation (Tasks 1.0-2.0)
Set up Next.js/Tailwind/Prisma, define the full schema, migrate, seed anonymized data.

### Phase 2: Core UI (Task 3.0)
Layout, auth screens, taxonomy browser, Project Detail shell.

### Phase 3: The Pipeline (Tasks 4.0-6.0)
Build each agent one at a time, in stage order: Intake → Triage → Specialist Review extraction. Each gets its own module, its own structured output, its own tests, before moving to the next.

### Phase 4: Cross-Cutting Features (Tasks 7.0-8.0)
Stage Tracker, Outputs Library, Version History, Knowledge Upload, and the Chatbot — all of which read across whatever the pipeline has produced so far.

### Phase 5: Polish & Deploy (Task 9.0)
Responsive/accessibility pass, end-to-end test, deploy to Vercel.

## Agent-Maintained Files

Two files must be maintained throughout development. Updated at CHECKPOINT subtasks.

### progress.md

Maintain at project root. Structure:

```
# Project Brain — Progress

## Current Status
- **Active Task**: [Current parent task]
- **Last Completed**: [Most recent completed parent task]
- **Blocked**: [Blockers or "None"]
- **Last Updated**: [ISO 8601 timestamp]

## Task Status
| Task | Status | Completed At |
|------|--------|-------------|
| 1.0 Project Setup | ✅ Complete | [timestamp] |
| 2.0 Data Layer | 🔄 In Progress | — |

## Notes
- [Implementation decisions, deviations, known issues]
```

Rules: Update only at CHECKPOINTs. Append only. Use emojis: ✅ 🔄 ⏳ 🚫

### agent.md

Maintain at project root. Rewrite (not append) at each CHECKPOINT. Structure:

```
# Project Brain — Codebase Summary

## Architecture Overview
[2-3 sentences on current state]

## File Inventory
### Source Files
| File | Purpose | Last Modified Task |
|------|---------|-------------------|

### Configuration Files
| File | Purpose |
|------|---------|

### Test Files
| File | Tests | Status |
|------|-------|--------|

## Key Dependencies
[Installed packages with versions]

## Environment Variables
[Env vars in use — names only, never values]

## Current State Summary
[1-2 sentences: what's built, what's next]
```

Rules: Rewrite at each CHECKPOINT. Keep under 150 lines. Never write actual secret values into this file.

### Checkpoint Workflow
At every CHECKPOINT subtask:
1. Open `progress.md` — update the task status table and current status section
2. Open `agent.md` — rewrite it to reflect the current codebase
3. Stage and commit: `git add . && git commit -m "checkpoint: [Task Name] complete"`
4. Read the next parent task from `tasks.md` and begin

### Session Start Protocol
When starting a new session:
1. Read `agent.md` — understand the current codebase
2. Read `progress.md` — understand what's done and what's next
3. Read `tasks.md` — find the first unchecked `[ ]` task
4. Begin executing from that task

## Testing Strategy

### Unit Tests (Vitest)
- All parsing utilities and agent modules must have tests
- **Mock the Anthropic API** in all tests — never make real API calls in the test suite
- Test that each agent's output matches its expected structured shape

### Component Tests (React Testing Library)
- Test rendering with various props/states
- Test user interactions (uploads, note-pasting, checklist ticking)

### Integration Tests
- Test the full Stage 1-5 flow end-to-end
- Explicitly test chatbot cross-project isolation: create two projects (same Client), verify a query against one never surfaces the other's data

## Common Pitfalls

### TypeScript
- ⚠️ Always define explicit return types, especially for agent module outputs
- ⚠️ Don't use `any` — use `unknown` with type guards, or better, the exact structured-output type

### Agents & AI Integration
- ⚠️ Every agent call must request and validate structured JSON output — never parse prose
- ⚠️ Handle Claude API errors gracefully — show user-friendly messages, never crash the flow
- ⚠️ Never auto-send the Clarification Email or any client-facing artifact — always a draft
- ⚠️ Every chatbot query MUST include a `project_id` filter in its database query — this is not optional, and should be checked in every PR/task touching the chatbot

### Styling
- ⚠️ Desktop-first, but test at mobile/tablet breakpoints (`sm:`, `md:`, `lg:` in Tailwind) before marking a UI task complete

### Security
- ⚠️ Never hardcode API keys or the database connection string — `.env.local` only, which must be gitignored
- ⚠️ Never write real client data into seed scripts or fixtures — anonymized data only (`Caroline` / `Fizzy`, `Coffee`, `Tooth`)

## Git Workflow

### Branch: `main` (trunk-based for pilot scale)

### Commit Conventions
```
type(scope): brief description
```
Types: feat, fix, test, refactor, docs, style, chore

### Checkpoint Commits
```bash
git add .
git commit -m "checkpoint: [Parent Task Name] complete"
```

## Success Criteria

MVP is complete when:
- [ ] All Level 1 features from the PRP are implemented
- [ ] All tests pass, with the Anthropic API mocked in the test suite
- [ ] No TypeScript errors or warnings
- [ ] UI is responsive (mobile, tablet, desktop)
- [ ] The full Stage 1-5 pipeline works end-to-end with a real (test) brief
- [ ] Chatbot cross-project isolation is verified by an explicit test, not just assumed
- [ ] No secrets appear anywhere in the git history
- [ ] Deployed to Vercel with a working URL

## Environment Setup

### Required Environment Variables
```env
DATABASE_URL=            # Neon Postgres connection string
ANTHROPIC_API_KEY=       # From console.anthropic.com
NEXTAUTH_SECRET=         # Generate with: openssl rand -base64 32
NEXTAUTH_URL=            # http://localhost:3000 in dev
```

### Quick Start
```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev          # Development server
npm test             # Run tests
npm run build        # Production build
```

## Kickoff Prompt (paste into Claude Code)

```
Read CLAUDE.md and README.md in this project root. Then:
1. Check if progress.md and agent.md exist — if yes, read them to orient
2. If not, this is a fresh start — begin with task 1.1 in tasks.md
3. Execute tasks sequentially — do not skip ahead
4. At every CHECKPOINT subtask, stop and update progress.md and agent.md
5. If you encounter ambiguity, check the PRP document (_planning/step1-inputs/Project_Brain_prp.md) for clarification
6. Never hardcode secrets. Never auto-send client-facing content. Every chatbot query must filter by project_id.
```

## Reference Links
- **PRP Document:** `_planning/step1-inputs/Project_Brain_prp.md`
- **PRP JSON:** `_planning/step1-inputs/Project_Brain_prp.json`
- **Repository:** github.com/paulworrall/Project_Brain
- **Deployment:** Vercel team "MAP" (to be linked once the app has code to deploy)

> Note: Step 1 planning artifacts are archived in `_planning/step1-inputs/`. Consult them for ambiguity — but `tasks.md`, `CLAUDE.md`, `README.md`, and `tasks.json` in the project root are the primary guides.

---

**Note to Claude Code:** Follow the task list sequentially. Complete all TESTING subtasks before moving forward. Make checkpoint commits after each parent task. If you encounter ambiguity, check the PRP. Never hardcode secrets or auto-send client-facing content, and never let a chatbot query cross project boundaries.
