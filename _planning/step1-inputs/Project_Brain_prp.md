# Project Brain — Product Requirements Prompt (PRP)

## Project Overview

**Goal:** An internal platform that makes the delivery, management, and communication of client projects more efficient. It uses Claude-powered agents to turn a client brief into a structured, staged workflow — generating key documents (clarification emails, position documents, scope documents, specialist briefs) at each stage, while keeping humans in control of every client- and specialist-facing conversation.

**Initial build scope:** Stages 1–5 of a 10-stage pipeline — Intake → Get Clarifications from Client → Triage → Review with Specialist Leads.

**Vibe/Style:** Clean, efficient, professional. Built from scratch — no existing design system to match. Genuinely well-designed rather than purely functional, since adoption by internal teams depends on the tool being pleasant to use, not just capable.

---

## Target Audience

**Who:** Two internal user groups at a creative/marketing agency:
- **Client Engagement** — Account Managers, Account Directors (own the client relationship)
- **Delivery** — Project Managers, Student through Senior level (run projects day to day)

**Problem solved:** Project scoping and setup today relies on ad hoc documents, emails, and inconsistent manual processes with no shared structure or historical record — making early-stage delivery slow, inconsistent, and hard to track across a lifecycle that can span days, weeks, or months.

**Context:**
- ~90% desktop usage, ~10% mobile (status checks/approvals on the go) — build desktop-first
- Users span junior to senior levels — the UX must require no training
- Real client briefs are confidential; the pilot uses **anonymized seed data** — Hub `Caroline`, Clients `Fizzy`, `Coffee`, `Tooth` — until IT/security approves real client data in the platform

---

## User Journey

1. AM/PM uploads or pastes a client brief (deck, Word doc, PDF, email, or call transcript) to start a new Project under a Hub → Client → Workstream
2. **Intake Agent** classifies the brief type, extracts what it can, generates: draft Clarification Email, Project Position Document, Project Set-Up Checklist
3. AM sends the clarification email externally; once the client replies, the PM pastes the response back in as freeform notes
4. An extraction step updates the Position Document (new version) — resolving flagged gaps, separating genuine unknowns from client-flagged "still deciding" items
5. **Triage Agent** generates the Draft Scope Document from the Position Doc + clarification notes — proceeds regardless of remaining gaps, but flags them clearly for specialists
6. PM shares the Draft Scope Document with Specialist Leads externally, then pastes their feedback back in
7. An extraction step generates the **Deliverables + Services Document**
8. Throughout: the PM/AM can see which Stage a project is in, tick off checklist items, and browse every past document/version

---

## Stage & Phase Model

The 10-stage pipeline is the source of truth for tracking, versioning, and artifacts — that doesn't change. But 10 individually-named, engineering-flavored stages ("Triage Agent," "Estimation Kick Off Agent") is the wrong thing to show a user by default; it reads as an internal decomposition, not how an AM or PM actually thinks about their week.

**Fix: add "Phase" as a presentation-layer grouping over the existing Stages — not a replacement for them.**

| Phase | Stages | Status for MVP |
|---|---|---|
| **1. Clarifying the brief and scope** | 1–4 (Client Brief, Intake, Get Clarifications, Triage) | Fully in scope |
| **2. Estimation and team planning** | 5–7 (Review with Specialist Leads, Estimation Kick Off, Estimation Session) | Stage 5 in scope; 6–7 shown as placeholders |
| **3. Statement of work and delivery setup** | 8–9 (Commercials Builder/SOW, Planning + Capability Briefing) | Placeholder only (Level 3 scope) |
| **Delivery Monitoring** *(not a Phase — separate, ongoing)* | 10 (Commercial Status) | Placeholder only — shown as a distinct indicator, not a phase step, since it recurs continuously through delivery rather than completing once |

**Implementation approach:** Phase is a **static configuration mapping** (e.g. `src/lib/phases.ts` listing which Stage IDs belong to which Phase), not a new database table. Stages remain exactly as already modeled — this is additive to the Stage Tracker's presentation, not a schema change, and doesn't touch anything already built.

**UI behavior:** The Stage Tracker shows the 3 Phases by default (collapsed except the active one), each expandable to reveal its underlying Stage-level detail. Delivery Monitoring renders as a separate, visually distinct element beneath the Phases, inactive until Stage 8-9 work exists.

**No change to the AI Agent Architecture above** — each Stage's action is still its own small, dedicated agent/extraction-step regardless of which Phase it's grouped under. Phase grouping is purely how progress is *displayed*; it doesn't change how the work is *computed*.

---

## AI Agent Architecture

Each "Agent" named in the workflow is **not** an autonomous, free-roaming bot — it's a narrow, single-purpose function with a fixed input and a structured output. That's a deliberately simpler (and more reliable) kind of AI system:

- **One dedicated module per agent** (e.g. `intake-agent.ts`, `triage-agent.ts`) — independently buildable, testable, and improvable without touching the others
- **Structured output, not free text** — each agent returns a defined JSON shape matching the exact fields we designed for its artifact, not prose the app has to parse
- **Multi-step logic split into separate calls where it helps accuracy** — e.g. Intake Agent classifies the brief type, *then* extracts fields for that type, as two calls rather than one
- **No heavyweight orchestration framework** — direct calls to the Anthropic API from backend functions is enough at this scale, and keeps the codebase simple to read and debug
- Each **parent task** in the implementation plan maps to one agent: define its prompt → define its output structure → wire it up → test it

**Agents in scope for MVP:**
1. Intake Agent (classify + extract → 3 artifacts)
2. Clarification Extraction step (freeform client reply → updated Position Document)
3. Triage Agent (Position Document + clarification → Draft Scope Document)
4. Specialist Review Extraction step (freeform specialist notes → Deliverables + Services Document)
5. Project Brain Chatbot (project-scoped Q&A)

### Knowledge Base & Project Chatbot

Two cross-cutting capabilities that sit *alongside* the staged workflow, available regardless of which Stage a project is in:

**Ad-hoc Knowledge Upload** — users can upload documents or paste meeting notes at any time, on any project. Stored as a new **Knowledge Item** entity (`project_id`, type, title, content/file, uploaded_by, uploaded_at) — distinct from the versioned Stage Documents, since these are supplementary and unstructured rather than pipeline artifacts.

**Project Brain Chatbot** — a per-project Q&A interface. Ask something like *"what is the delivery date?"* and it answers using only that project's own data.

**How project isolation is guaranteed (not just prompted):** every chatbot query is scoped with a `project_id` filter **at the database query level**, before anything reaches Claude. This means another project's data — even a different project under the *same* Client — is never retrieved into context in the first place. There's nothing for the model to leak, because it's structurally never given it. This is a database-scoping guarantee, not a matter of trusting the AI to behave.

**Scaling note (later, not MVP):** for pilot scale, assembling all of one project's documents/notes directly into Claude's context per question is simple and reliable. If a project accumulates a very large volume of notes over many months, a Level 2 enhancement would add a semantic-search step — still strictly scoped to that one project — rather than passing everything in every time.

---

## Core Features

### Level 1 — MVP (Stages 1–5 only)

**Functionality:**
- Multi-format brief ingestion (Word, PDF, PPTX, pasted text/transcript)
- Intake Agent → 3 artifacts (Clarification Email, Position Document, Set-Up Checklist)
- Freeform note capture at every human touchpoint, feeding the next agent
- Triage Agent → Draft Scope Document (proceeds with gaps flagged, no auto-loop-back)
- Specialist-review capture → Deliverables + Services Document
- Project Stage Tracker (visual current-stage status per project)
- Outputs Library — every artifact kept, versioned at each stage transition
- Manual tick-box checklist (no external system integration yet)
- Taxonomy: Hub → Client → Workstream → Project, seeded with Hub `Caroline` / Clients `Fizzy`, `Coffee`, `Tooth`
- Simple email/password auth; two roles (Client Engagement, Delivery)
- **Ad-hoc knowledge upload** — documents/meeting notes added at any time, on any project, building a running knowledge base independent of the staged workflow
- **Project Brain Chatbot** — per-project natural-language Q&A, answered strictly from that project's own data (see AI Agent Architecture above for how isolation is guaranteed)

**Key inputs:** Client brief (file/text), freeform notes, checklist tick-offs, taxonomy selection, ad-hoc knowledge uploads, chatbot questions

**Key outputs:** Clarification Email draft, Project Position Document (versioned), Set-Up Checklist, Draft Scope Document, Deliverables + Services Document, per-project stage/version history, chatbot answers grounded only in that project's data

### Level 2 — Platform Enhancements (out of scope for now)

- Bespoke per-client onboarding/configuration (structure overrides)
- Auto-ingestion of briefs (email forwarding, Teams/SharePoint)
- Automated triggers/notifications for checklist items
- Company SSO (Microsoft/Azure AD)
- Integration with the real "Workbook" resource-management tool

### Level 3 — Future Complexity (Stages 6–10, out of scope for now)

- Estimation Kick Off Agent (6) + Estimation Session capture (7)
- Commercials Builder Agent (8) — including SOW as a Word doc from a client-specific baseline template
- Planning Agent + Capability Briefing Agent in parallel (9) — needs multiple concurrent documents within one stage
- Commercial Status Agent (10) — recurring monitoring, not a one-time gate
- Multi-client bespoke taxonomy variants

---

## Technical Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Database | PostgreSQL (Neon), Prisma ORM |
| Styling | Tailwind CSS — custom, no existing design system |
| AI | Anthropic Claude via the Anthropic API |
| Documents | Parsing: docx/pdf/pptx ingestion. Generation: Markdown/PDF now, docx later (SOW template) |
| Auth | Simple email/password (NextAuth), upgradeable to SSO later |
| Version control | Git + GitHub — **already set up** (`github.com/paulworrall/Project_Brain`) |
| Hosting | Vercel (app), Neon (database) — **accounts already created** |

---

## System Rules for the AI Coding Agent

- Never auto-send client-facing emails or documents — every client-facing artifact is a **draft for human review**
- Always separate genuine gaps in agency understanding from client-flagged "still deciding" items (TBC / "???" ) — these are semantically distinct and live in separate sections
- Version documents at **stage transitions**, not on every edit
- Use only anonymized/test data (`Caroline` / `Fizzy`, `Coffee`, `Tooth`) until real client data is approved
- **Never** hardcode secrets — environment variables only, via a gitignored `.env.local`
- The Services capability list is fixed: Experience/Creative, Business, Architecture, Tech and Data, Orchestration, Other (free-text label)
- Every chatbot query must filter by `project_id` — never assemble or expose data from more than one project in a single response, even across projects under the same Client

---

## Implementation Path

1. **This PRP** — defines what's being built, for whom, and why ✅
2. **Implementation plan** — `tasks.json`, `tasks.md`, `CLAUDE.md`, `README.md` for the build agent (next)
3. **Build with Claude Code** — executed locally against the `Project_Brain` repo
