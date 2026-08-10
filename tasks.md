# Task List: Project Brain Implementation

## Context
**Source PRP:** `_planning/step1-inputs/Project_Brain_prp.md`
**Implementation Goal:** Implement all Level 1: MVP features — Stages 1-5 of the project workflow (Intake, Get Clarifications, Triage, Review with Specialist Leads), plus the Knowledge Upload and Project Brain Chatbot features.

## Relevant Files & Notes
* **Relevant Files:** Greenfield — repo exists (`github.com/paulworrall/Project_Brain`) but is empty. Accounts already provisioned: GitHub, Anthropic Console, Vercel (team: MAP), Neon Postgres (Postgres 18).
* **Figma:** No — no design assets. Build from scratch following the "clean, efficient, professional" direction in the PRP.
* **Notes:** Real pilot, not a demo — prioritize correctness of agent outputs alongside strong UX. Desktop-first (~90%), mobile-usable (~10%). Only anonymized seed data (Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth`) until real client data is approved. Every agent returns structured JSON, never free text. Client-facing artifacts are always drafts. Chatbot cross-project isolation is a hard requirement.

---

## Implementation Tasks (Atomic Steps)

### 1.0 Project Setup & Environment
* [x] 1.1 Initialize Next.js (App Router, TypeScript) project at repo root
* [x] 1.2 Install and configure Tailwind CSS
* [x] 1.3 Install Prisma and initialize Prisma Client configuration
* [x] 1.4 Create `.env.local.example` (committed) and `.env.local` (gitignored) with placeholders for `DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`
* [x] 1.5 Scaffold NextAuth with email/password credentials provider
* [x] 1.6 Configure ESLint and Prettier
* [x] 1.7 Create initial project directory structure per CLAUDE.md
* [x] 1.8 Verify local dev server runs and Prisma connects to the Neon database
* [x] 1.9 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 2.0 Data Layer & Schema
* [x] 2.1 Define Prisma models: Hub, Client, Workstream, Project (taxonomy relations)
* [x] 2.2 Define Prisma models: Stage (linear + recurring types) and ProjectStageStatus
* [x] 2.3 Define Prisma models: Document and DocumentVersion (typed per artifact)
* [x] 2.4 Define Prisma model: ChecklistItem
* [x] 2.5 Define Prisma model: TouchpointNote
* [x] 2.6 Define Prisma model: KnowledgeItem
* [x] 2.7 Define Prisma model: User (role enum: ClientEngagement, Delivery)
* [x] 2.8 Run initial Prisma migration against Neon
* [x] 2.9 Write seed script: Hub `Caroline`, Clients `Fizzy`/`Coffee`/`Tooth`, one Workstream each, one demo Project
* [x] 2.10 **TESTING:** Unit tests for schema constraints/relations (Vitest + Prisma test utilities)
* [x] 2.11 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 3.0 Core UI Shell, Navigation & Auth
* [x] 3.1 Build base layout (header, sidebar navigation, footer)
* [x] 3.2 Build login/signup screens wired to NextAuth
* [x] 3.3 Build Hub → Client → Workstream → Project taxonomy browser
* [x] 3.4 Build Project Detail page shell (Stage Tracker, Outputs Library, Chatbot, Knowledge Upload tabs)
* [x] 3.5 Establish base design tokens (colors, typography, spacing)
* [x] 3.6 **TESTING:** Component tests for navigation and auth flows
* [x] 3.7 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 4.0 Intake Agent & Brief Ingestion (Stages 1-2)
* [x] 4.1 Build brief upload/paste UI on the Project creation flow
* [x] 4.2 Implement document parsing utilities: docx, pdf, pptx → plain text
* [x] 4.3 Implement Intake Agent — brief-type classification call to Claude
* [x] 4.4 Extend Intake Agent — field-extraction call returning structured JSON (Position Document fields)
* [x] 4.5 Implement Clarification Email draft generator
* [x] 4.6 Implement Project Position Document generator (all sections always shown; Client-Flagged Open Items kept separate from genuine gaps)
* [x] 4.7 Implement Project Set-Up Checklist generator
* [x] 4.8 Build UI to display the generated Email draft, Position Document, and Checklist
* [x] 4.9 Wire Stage 1 → 2 transition
* [x] 4.10 **TESTING:** Unit tests for parsing utilities and Intake Agent output, mocking the Claude API
* [x] 4.11 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 5.0 Clarification Capture & Triage Agent (Stages 3-4)
* [x] 5.1 Build UI for pasting freeform client clarification notes
* [x] 5.2 Implement Clarification Extraction step (Position Doc + notes → updated fields)
* [x] 5.3 Implement Position Document versioning at this stage transition
* [x] 5.4 Implement Triage Agent — generate Draft Scope Document, proceeding regardless of gaps but flagging them
* [x] 5.5 Build UI to display the Draft Scope Document with gaps flagged
* [x] 5.6 Wire Stage 3 → 4 transition
* [x] 5.7 **TESTING:** Unit tests for extraction step and Triage Agent output, mocking the Claude API
* [x] 5.8 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 6.0 Specialist Review Capture & Deliverables + Services (Stage 5)
* [x] 6.1 Build UI for pasting freeform specialist-lead feedback notes
* [x] 6.2 Implement Specialist Review Extraction step → Deliverables + Services Document fields
* [x] 6.3 Build UI to display the Deliverables + Services Document (editable "Other" label)
* [x] 6.4 Wire Stage 4 → 5 transition
* [x] 6.5 **TESTING:** Unit tests for extraction step output, mocking the Claude API
* [x] 6.6 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 7.0 Outputs Library, Stage Tracker & Version History
* [x] 7.1 Build Stage Tracker component (Stages 1-5 active, 6-10 as placeholders)
* [x] 7.2 Build Outputs Library view (all Documents per project, grouped by type)
* [x] 7.3 Build Version History view (prior versions with stage-transition timestamps)
* [x] 7.4 Wire manual checklist tick-box persistence
* [x] 7.5 **TESTING:** Component tests for Stage Tracker, Outputs Library, Version History
* [x] 7.6 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 8.0 Ad-hoc Knowledge Upload & Project Brain Chatbot
* [x] 8.1 Implement KnowledgeItem upload UI (available anytime, any Stage)
* [x] 8.2 Implement KnowledgeItem storage/parsing (reuse 4.2 utilities)
* [x] 8.3 Build the per-project chatbot UI
* [x] 8.4 Implement chatbot backend: context assembly strictly filtered by `project_id`, then Claude call
* [x] 8.5 Implement explicit cross-project isolation check
* [x] 8.6 **TESTING:** Unit + integration tests for context assembly and isolation
* [x] 8.7 **CHECKPOINT:** Update `progress.md` and `agent.md`, commit

### 9.0 Polish, Testing, QA & Deployment Prep
* [x] 9.1 Responsive pass across breakpoints
* [x] 9.2 Accessibility pass (keyboard nav, ARIA, contrast)
* [x] 9.3 **TESTING:** End-to-end test of the full Stage 1-5 happy path
* [x] 9.4 Verify no hardcoded secrets; confirm `.env.local` is gitignored
* [x] 9.5 Production build verification (`npm run build`); fix TypeScript/lint errors
* [ ] 9.6 Deploy to Vercel; set environment variables; verify live URL end-to-end
* [ ] 9.7 **CHECKPOINT:** Final `progress.md`/`agent.md` update, commit
* [ ] 9.8 Tag release: `v0.1.0-mvp`
