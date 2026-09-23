# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), Client/Workstream taxonomy navigation + global search, Phase 1 as a fluid workspace, commercial documents in one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), the "Capabilities & Estimate Brief" panel, "Build The Estimate" (Stage 6), "Generate SOW" (Stage 8), and brief key attributes.

**Brief key attributes (this session)**: `src/lib/briefAttributes.ts` is the one definition of what a complete brief contains — 4 required attributes (Budget, Objective, Timeline and Key Milestones, Client Contact) and optional ones (scope, markets, languages, channels), each with a question and sub-fields. `getBriefCompleteness(projectId)` is the only place status (missing/partial/confirmed) and the `canProceed` flag are decided. AI extraction only ever writes **suggestions**; only a PM confirms. **Generate SOW is refused until all 4 required attributes are confirmed**, with an alert listing exactly what's missing (inline fill-in forms). Projects already past Phase 1 get a warning, not a lock-out. Later features (the "What We Need to Find Out" checklist, the client email's open questions, the SOW PM review) are meant to read `getBriefCompleteness()` — not built yet.

**Build The Estimate**: "+ New estimate" (a modal running the whole flow) or the estimate's own page. Adding a role is one step; extraction + rate-card matching run automatically. An unconfirmed rate-card line or a missing/ambiguous unit sits in `RoleResolutionReview` and blocks saving. Every quantity has an explicit `EstimateUnit` and is priced as hours × hourly-equivalent rate, with factors only from `getConversionFactors(project)` (7.5 hrs/day, 5 days/week, stored per version). Versions saved before that fix are flagged `needsRecalculation`, never altered.

**Generate SOW**: pick a SOW Template, click "Generate SOW" (gated as above); the app assembles everything captured about the project into an AI-drafted `.docx` guided by the template. Regenerating appends a version.

## File Inventory

### Source Files — Brief key attributes (this session)
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `src/lib/briefAttributes.ts` | The config: attributes, questions, sub-fields (type, required, hint), `projectDateFields` (timeline start/end ↔ project kick-off/target dates). The only place attribute ids live | Key attributes |
| `src/lib/briefCompleteness.ts` | `getBriefCompleteness(projectId)` + pure `evaluateBriefCompleteness` — status from PM-confirmed values only, pending suggestion, missing sub-fields, `requiredOutstanding`, `canProceed`, `isPastPhase1`, `warnings` | Key attributes |
| `src/lib/briefAttributeValues.ts` | Prisma-free: normalize/validate/compare/merge values and read them from FormData, all driven by the config | Key attributes |
| `src/lib/briefAttributeSuggestions.ts` | `saveKeyAttributeSuggestions` — stores SUGGESTION rows, merging each source over what's known, skipping no-ops | Key attributes |
| `src/services/agents/key-attribute-extraction.ts` | One Claude call; output schema built from the config; never guesses | Key attributes |
| `prisma/schema.prisma` + migration `20260923170000_add_brief_attribute_values` | Append-only `BriefAttributeValue` (attributeId string, kind SUGGESTION/CONFIRMED, source, values JSON, evidence, knowledgeItemId, creator, time). Additive only | Key attributes |
| `projects/[projectId]/actions.ts` | `confirmBriefAttributeAction`, `suggestBriefAttributesAction`, extraction in `uploadKnowledgeItemAction` (non-fatal), date sync in `updateProjectSummaryAction`, the gate in `generateSowAction` | Key attributes |
| `projects/new/actions.ts` | Extraction on the brief at creation (non-fatal) | Key attributes |
| `KeyAttributesPanel.tsx`, `KeyAttributeForm.tsx`, `BriefGateNotice.tsx` (`BriefGateAlert`, `BriefCompletenessWarning`), `BriefReadinessIndicator.tsx`, `StartSowDevelopmentPanel.tsx`, `Phase1Workspace.tsx`, `PositionDocumentView.tsx`, `ProjectWorkflow.tsx` | Key details panel, per-attribute forms, the SOW gate alert, past-Phase-1 warning, "x of 4 confirmed" strip, "Other details from the brief" | Key attributes |

Removed this session: `src/lib/foundationDetails.ts`, `FoundationDetailsBlock.tsx` (the old keyword-matched "5 of 5" readiness).

### Source Files — Estimates, SOW (prior sessions)
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `src/services/pricing/{unit-conversion,estimate-pricing}.ts`, `src/lib/{estimateUnits,estimateUnitsConfig,estimateContentDraft,estimateBuildViewData}.ts` | Unit conversion, hours-based pricing, the next-version draft and review data | Unit conversion |
| `src/lib/estimateMatching.ts`, `src/services/agents/{rate-card-line-item-agent,estimate-role-extraction-agent,estimate-role-matching-agent}.ts` | Rate card parsing, role extraction/matching, conservative auto-resolve gate | Build The Estimate |
| `src/types/sow.ts`, `src/lib/sow-context.ts`, `src/services/agents/sow-agent.ts`, `src/services/documents/sow-docx.ts` | SOW content, context assembly, drafting, rendering | Generate SOW |

### Source Files — everything else
Unchanged recently — see `progress.md`. Auth (`src/lib/{auth,permissions}.ts`, `src/proxy.ts`), taxonomy pages, MSA/Rate Card/SOW Template libraries + `VersionHistory.tsx`, `CapabilitiesAndEstimateBriefPanel.tsx`, and the Stage 1-5 agents in `src/services/agents/{intake-agent,triage-agent,clarification-extraction,specialist-review-extraction,chatbot}.ts`.

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Scripts (`postinstall: prisma generate`), deps, `uuid` override for `exceljs` |
| `prisma.config.ts` | Prisma 7 config — loads `.env.local`, schema/migrations paths, seed |
| `next.config.ts` | `serverExternalPackages` incl. `officeparser` |
| `.prettierrc.json`, `eslint.config.mjs`, `vitest.config.mts`, `.claude/launch.json` | Formatting (printWidth 100), lint, tests, dev/prod preview servers |
| `.gitignore` | Includes `.env.local` |

### Test Files (68 files, 446 tests, all passing)
| File | Tests | Status |
|------|-------|--------|
| `tests/lib/briefAttributes.test.ts` | Config loads; the 4 required attributes, questions, sub-field requiredness; optional attributes seeded | ✅ New |
| `tests/lib/briefCompleteness.test.ts` | Missing/partial/confirmed per attribute; suggestions stay unconfirmed; gate lists exactly what's missing; optional never affects `canProceed`; past-Phase-1 warnings | ✅ New |
| `tests/services/key-attribute-extraction.test.ts` | Schema from config, normalization, bad values dropped, friendly errors | ✅ New |
| `tests/brief-key-attributes.test.ts` (real DB) | Suggestions only from uploads, non-fatal extraction, on-demand merge, confirm/accept/edit sources, validation, date sync both ways, SOW gate | ✅ New |
| `tests/fixtures/briefCompleteness.ts` | Shared completeness fixtures built with the real status logic | ✅ New |
| `tests/components/{StartSowDevelopmentPanel,Phase1Workspace,ProjectWorkflow,PositionDocumentView,DocumentVersionContent}.test.tsx`, `tests/{stage-1-5-happy-path,sow-generation}.test.ts` | Updated: SOW gate alert + inline fill-in, Key details panel, readiness strip, warning banner, extra extraction calls | ✅ |
| Everything else | Estimates/unit conversion, SOW, Stage 1-5 pipeline, chatbot cross-project isolation, components | ✅ |

## Key Dependencies
`next` 16.3.5, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `next-auth` ^5.0.0-beta.32, `zod` ^4.4.3, `@anthropic-ai/sdk` ^0.115.0, `officeparser` ^7.5.1, `docx` ^9.7.1, `exceljs` ^4.4.0, `vitest` 4.1, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — in `.env.local` (gitignored). Never `Read` `.env.local` as a whole file.

## Toolchain Notes (this machine)
- **DB-touching Prisma CLI commands require WSL.** Generate migration SQL offline with `prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script` (no DB needed), hand-edit when data must be preserved, and apply with `prisma migrate deploy`, which never prompts for a reset. After any WSL-side `npm install`, run `npm install` again from native Windows.
- **Dev and production share one Neon DB** — a migration goes live the moment it's applied, while production still runs the old code until the next deploy. Keep schema changes additive/backward-compatible, or apply them right before deploying.
- **Shared DB with real user-created data** — inspect the affected rows (read-only) before writing a migration that touches an existing table.
- **`zodOutputFormat` does not enforce `z.enum`**, and hoists nested objects into `$defs`. Don't rely on an enum to constrain agent output; accept a string and normalize/validate in code.
- **Adding a Claude call to an existing flow shifts every `mockResolvedValueOnce` queue** in tests that drive that flow — update them (and their call counts) together.
- **Keep Prisma runtime imports out of client components** — shared pure helpers go in Prisma-free modules (e.g. `src/lib/briefAttributeValues.ts`, `src/lib/estimateUnits.ts`); type-only imports are fine.
- **Prisma `Decimal` isn't JSON-serializable across the Server→Client boundary** — convert to `Number` server-side (`Date` is fine).
- **`react-hooks/set-state-in-effect`**: react to an action's result inside the action function, not a `useEffect` watching `pending`.
- **API download routes need their own session check** — `src/proxy.ts`'s matcher excludes `/api/*`.
- **Run `npx prettier --write` only on new or substantially changed files** — much existing code predates the Prettier config.
- **Stop the dev server before `npm run build`** — both use `.next`.
- **Scripted edits**: no Python on this machine; use Node. Many files are CRLF — normalize to LF while editing and restore on write. The shell tool mangles apostrophes and backslashes in heredocs, so write edit scripts to the scratchpad with the Write tool first.

## Current State Summary
All MVP scope plus Build The Estimate, Generate SOW and brief key attributes are built. **This session**: added the configurable brief key-attribute schema, PM-confirmed status via `getBriefCompleteness()`, AI suggestions from the brief and every input, and the Generate SOW gate (committed `c238453`, deployed to Vercel; new screens not yet checked in a live browser). Next: move the "What We Need to Find Out" checklist, the client email's open questions and the SOW PM review onto `getBriefCompleteness()`; the Draft Scope is due to be removed.
