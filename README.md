# Project Brain

> Turning a client brief into a structured, staged project workflow — with AI agents doing the drafting, and humans staying in control of every client and specialist conversation.

## Overview

Project Brain is an internal platform built for the Client Engagement and Delivery teams at a creative/marketing agency. It replaces ad hoc documents, emails, and inconsistent manual processes with a structured, staged workflow for scoping new client projects.

A client brief — in whatever format it arrives (deck, Word doc, PDF, email, call transcript) — kicks off a Project. From there, Claude-powered agents generate the documents each stage needs: a clarification email, a position document, a draft scope, a specialist deliverables breakdown — while every client- and specialist-facing conversation stays firmly in human hands, drafted for review rather than sent automatically.

This is a real internal pilot, not a demo, currently scoped to Stages 1-5 of a 10-stage pipeline (Intake, Get Clarifications, Triage, Review with Specialist Leads), plus an ad-hoc knowledge base and a project-scoped Q&A chatbot.

## Features

### ✅ MVP Features (Level 1)
- **Multi-format brief ingestion**: Upload or paste a brief in whatever format it arrives (Word, PDF, PPTX, plain text)
- **Intake Agent**: Classifies the brief, extracts what it can, drafts a clarification email, a Project Position Document, and a set-up checklist
- **Clarification capture**: Paste the client's reply as freeform notes; the platform updates the Position Document, separating genuine gaps from things the client themselves flagged as "still deciding"
- **Triage Agent**: Produces a Draft Scope Document, proceeding even with open gaps — but flagging them clearly for specialists
- **Specialist review capture**: Paste specialist feedback; the platform generates a Deliverables + Services breakdown
- **Stage Tracker**: See which of the 3 phases (Clarifying the Brief and Scope / Estimation and Team Planning / Statement of Work and Delivery Setup) each project is in, expandable to granular stage detail — plus a separate Delivery Monitoring indicator once a project reaches delivery
- **Outputs Library & Version History**: Every generated document, kept and versioned at each stage transition
- **Hub → Client → Workstream → Project taxonomy**
- **Ad-hoc Knowledge Upload**: Add documents or meeting notes to a project at any time, independent of its current stage
- **Project Brain Chatbot**: Ask natural-language questions about a specific project, answered strictly from that project's own data

### 🚀 Planned Features (Level 2+)
- Bespoke per-client onboarding/configuration
- Auto-ingestion of briefs (email forwarding, Teams/SharePoint integration)
- Company SSO (Microsoft/Azure AD)
- Integration with the organization's Workbook resource-management tool
- Stages 6-10: Estimation, Commercials/SOW generation, Planning, Commercial Status monitoring

## Technology Stack

### Frontend
- **Next.js** (App Router) with TypeScript
- **Tailwind CSS** — custom design, built from scratch
- **React state / Server Components** for state management

### Backend & Services
- **PostgreSQL** (hosted on Neon) with **Prisma ORM**
- **NextAuth** — email/password authentication (upgradeable to SSO)
- **Anthropic Claude** via the Anthropic API — powers every agent directly, no orchestration framework

### Testing & Quality
- **Vitest** — unit tests
- **React Testing Library** — component tests
- **TypeScript** — static type checking
- **ESLint** — code linting

### Deployment
- **Vercel** — hosting, automatic deploys from GitHub

## Prerequisites

Before you begin, ensure you have:
- **Node.js** (v18 or higher)
- **npm**
- **Git**

You'll also need:
- An Anthropic API key (from console.anthropic.com)
- A Neon Postgres connection string (from neon.tech)

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/paulworrall/Project_Brain.git
cd Project_Brain
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration

Copy the example file and fill in your own values:
```bash
cp .env.local.example .env.local
```

```env
DATABASE_URL=your_neon_connection_string
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXTAUTH_SECRET=generate_with_openssl_rand_-base64_32
NEXTAUTH_URL=http://localhost:3000
```

**Where to find these values:**
- `DATABASE_URL` — Neon dashboard → your project → Connection Details
- `ANTHROPIC_API_KEY` — console.anthropic.com → API Keys (generate once; it can't be viewed again after creation)
- `NEXTAUTH_SECRET` — generate locally, don't reuse across environments

**Never commit `.env.local` or paste these values into chat, docs, or Slack.**

### 4. Set Up the Database
```bash
npx prisma migrate dev
npx prisma db seed
```
This creates the schema and seeds anonymized pilot data: Hub `Caroline`, Clients `Fizzy`, `Coffee`, `Tooth`.

## Usage

### Development Server
```bash
npm run dev
```
The application will be available at `http://localhost:3000`

### Building for Production
```bash
npm run build
npm run start
```

## Project Structure

```
project-root/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/
│   │   ├── ui/                 # Reusable UI components
│   │   ├── features/           # StageTracker, DocumentViewer, Chatbot, etc.
│   │   └── layout/
│   ├── services/
│   │   ├── agents/              # One module per agent (intake, triage, extraction steps, chatbot)
│   │   └── parsing/              # docx/pdf/pptx → plain text
│   ├── lib/                     # Prisma client, auth config, utils
│   └── types/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── tests/
├── progress.md                  # Agent-maintained progress tracker
├── agent.md                     # Agent-maintained codebase summary
├── .env.local                   # Not committed
├── .env.local.example
└── package.json
```

## Development Workflow

### Branch Strategy
- **`main`**: trunk-based for pilot scale — no separate feature branches required yet

### Commit Convention
```
type(scope): brief description
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Testing

```bash
npm test                    # Run all tests
npm test -- --watch         # Watch mode
```

- **Unit tests**: parsing utilities, agent modules (Anthropic API mocked)
- **Component tests**: all user-facing components
- **Integration tests**: full Stage 1-5 flow; explicit chatbot cross-project isolation check

## Deployment

### Vercel
The project is linked to Vercel (team: **MAP**). Pushing to `main` triggers a production deployment automatically once the project is imported in the Vercel dashboard.

Set environment variables in **Vercel → Project Settings → Environment Variables** — the same names as `.env.local`, with production values (e.g. the production Neon connection string).

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon Postgres connection string | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key, powers every agent | Yes |
| `NEXTAUTH_SECRET` | Session encryption secret | Yes |
| `NEXTAUTH_URL` | Base URL of the app | Yes |

## Troubleshooting

**Build fails with TypeScript errors**
```bash
rm -rf .next
npm run build
```

**Database connection fails**
- Verify `DATABASE_URL` in `.env.local` matches the Neon dashboard exactly
- Confirm the Neon project is active (free-tier projects can idle/pause)

**Claude API calls fail**
- Verify `ANTHROPIC_API_KEY` is valid and has billing set up in the Anthropic Console
- Check for rate limits if many agent calls run in quick succession

## Security Notes

- Real client data must **not** be entered into this platform until IT/security has signed off — pilot uses anonymized seed data only
- API keys and database connection strings live only in `.env.local` (gitignored) or the Vercel dashboard — never in code, commits, chat, or documents
- Every chatbot query is scoped to a single project via a database-level filter — cross-project data exposure is a bug, not a tuning issue, if it ever occurs

## Contact & Support

- **Project Owner:** Paul Worrall
- **Repository:** github.com/paulworrall/Project_Brain

---

**Built for the VML MAP team**
