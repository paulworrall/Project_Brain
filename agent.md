# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), Client/Workstream taxonomy navigation + global search, Phase 1 as a fluid workspace, commercial documents in one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), the "Capabilities & Estimate Brief" panel, "Build The Estimate" (Stage 6), and "Generate SOW" (Stage 8).

**Build The Estimate, current shape**: "+ New estimate" (a modal running the whole flow) or the estimate's own page. Adding a role is one step: paste or upload, and extraction + rate-card matching run automatically, with each role's capability AI-classified. Anything needing a human — an unconfirmed rate-card line **or a missing/ambiguous unit** — sits in `RoleResolutionReview` and blocks saving. The Review grid is one flat table with inline quantity + unit editing, showing e.g. "1.5 days (11.25 hrs)". Saving appends an immutable version; Word + Excel downloads.

**Estimate pricing (this session)**: every quantity has an explicit `EstimateUnit` (HOURS/DAYS/WEEKS) and is converted to hours before pricing: fee = hours × hourly-equivalent rate (daily/weekly rate cards handled the same way). Conversion factors come only from `getConversionFactors(project)` (global default 7.5 hrs/day, 5 days/week; built to take a per-client MSA value later, not built yet) and are stored on each saved version. Versions saved before this fix are flagged `needsRecalculation`, never altered.

**Generate SOW**: pick a SOW Template, click "Generate SOW"; the app assembles everything captured about the project (documents, capabilities, the latest saved estimate, project fields) into an AI-drafted `.docx` guided by the template's structure/tone. Regenerating appends a version. A flagged estimate is passed through with a "not final" warning and the SOW marks its commercials provisional.

## File Inventory

### Source Files — Estimate unit conversion (this session)
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `prisma/schema.prisma` + migration `20260923120000_add_estimate_units` | `EstimateUnit` enum; `RoleResolution.extractedUnit` (nullable = needs review) + `rawUnitText`; `EstimateLineItem.unit`/`rawUnitText`/`hours`; `EstimateVersion.hoursPerDay`/`daysPerWeek`/`needsRecalculation`. Hand-written SQL keeps old free text verbatim and flags all pre-existing versions | Unit conversion |
| `src/lib/estimateUnitsConfig.ts` | `HOURS_PER_DAY`, `DAYS_PER_WEEK` global defaults — never read directly by calculations | Unit conversion |
| `src/services/pricing/unit-conversion.ts` | `getConversionFactors(project)` (the single resolver), `hoursPerUnit`, `toHours` | Unit conversion |
| `src/lib/estimateUnits.ts` | Prisma-free, client-safe: `parseEstimateUnit` (unknown → null, never hours), `formatQuantityWithHours`, `ESTIMATE_UNIT_OPTIONS`, `conversionBasisNote` | Unit conversion |
| `src/services/pricing/estimate-pricing.ts` | `computeLineItemFee({quantity, unit, rate, rateType}, factors)` → `{hours, fee}`; `Prisma.Decimal` throughout, fee rounded to 2dp | Unit conversion |
| `src/lib/estimateContentDraft.ts` | Prices the next version; `roleNeedsReviewWhere()` is the one shared definition of "pending" | Unit conversion |
| `src/types/estimates.ts`, `estimate-role-extraction-agent.ts` | Extraction returns `unit` (nullable string, mapped by `parseEstimateUnit`) + `rawUnitText`; the prompt forbids assuming hours | Unit conversion |
| `estimates/actions.ts`, `RoleResolutionReview.tsx`, `EstimateReviewCard.tsx`, `EstimateBuildWorkspace.tsx`, `EstimatesListPanel.tsx`, `estimate-document-{docx,xlsx}.ts`, `sow-context.ts`, `sow-docx.ts` | Unit picker/selector, "x days (y hrs)" display, recalculation warnings, Quantity column in exports, SOW "not final" handling | Unit conversion |

### Source Files — Generate SOW, Build The Estimate (prior sessions)
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `src/types/sow.ts`, `src/lib/sow-context.ts`, `src/services/agents/sow-agent.ts`, `src/services/documents/sow-docx.ts` | SOW content schema (agent narrative kept separate from never-agent-authored `SowCoverDetails`), context assembly, one Claude call, rendering | Generate SOW |
| `src/app/api/projects/[projectId]/sow/[versionId]/route.ts`, `StartSowDevelopmentPanel.tsx` | Session-gated download; generate/regenerate + version history | Generate SOW |
| `src/lib/estimateMatching.ts`, `estimateMatchingConfig.ts` | Conservative gate: role-only matches never auto-resolve | Build The Estimate |
| `src/services/agents/{rate-card-line-item-agent,estimate-role-matching-agent}.ts` | Rate card parsing (cached per version), role matching | Build The Estimate |
| `src/components/features/BuildEstimateInputForm.tsx`, `src/components/ui/Modal.tsx` | Add-role-and-auto-analyze flow; generic modal | Build The Estimate |

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

### Test Files (65 files, 420 tests, all passing)
| File | Tests | Status |
|------|-------|--------|
| `tests/estimate-unit-conversion.test.ts` | hours/days/weeks, 1.5 days @ 220/hr = 2,475.00, the real 6-line estimate = 49,275.00, unknown unit → null, formatting | ✅ New |
| `tests/estimate-build.test.ts` (real DB) | + missing unit held for review and blocks save; saved version keeps its hours-per-day; unit correction reprices | ✅ Extended |
| `tests/components/EstimateReviewCard.test.tsx` | Renders "1.5 days (11.25 hrs)", fees, total, unit selector | ✅ New |
| `tests/estimate-pricing.test.ts`, `tests/services/estimate-{role-extraction-agent,role-matching-agent,document-xlsx}.test.ts`, `tests/sow-context.test.ts` | Updated for the new pricing signature / unit fields | ✅ |
| `tests/sow-*.test.ts`, `tests/services/sow-*.test.ts` | SOW generation, context, download (incl. 401), docx | ✅ |
| Everything else | Stage 1-5 pipeline, chatbot cross-project isolation, components | ✅ |

## Key Dependencies
`next` 16.3.5, `react`/`react-dom` 19.2.8, `tailwindcss` ^4, `prisma`/`@prisma/client` 7.9.1, `@prisma/adapter-pg` ^7.9.1, `next-auth` ^5.0.0-beta.32, `zod` ^4.4.3, `@anthropic-ai/sdk` ^0.115.0, `officeparser` ^7.5.1, `docx` ^9.7.1, `exceljs` ^4.4.0, `vitest` 4.1, `@testing-library/*`.

## Environment Variables
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — in `.env.local` (gitignored). Never `Read` `.env.local` as a whole file.

## Toolchain Notes (this machine)
- **DB-touching Prisma CLI commands require WSL.** For migrations, hand-write the SQL (needed anyway to preserve data, e.g. rename-then-map instead of drop/add) and apply with `prisma migrate deploy`, which never prompts for a reset. After any WSL-side `npm install`, run `npm install` again from native Windows.
- **Shared dev DB with real user-created data** — inspect the affected rows (read-only) before writing a migration that touches an existing table.
- **`zodOutputFormat` does not enforce `z.enum`** — it becomes a plain string with the values in the description. Don't rely on an enum to constrain agent output; accept a string and normalize/validate in code (see `parseEstimateUnit`).
- **Keep Prisma runtime imports out of client components** — put shared pure helpers in a Prisma-free module (e.g. `src/lib/estimateUnits.ts`).
- **Prisma `Decimal` isn't JSON-serializable across the Server→Client boundary** — convert to `Number` server-side.
- **`react-hooks/set-state-in-effect`**: react to an action's result inside the action function, not a `useEffect` watching `pending`.
- **API download routes need their own session check** — `src/proxy.ts`'s matcher excludes `/api/*`.
- **Run `npx prettier --write` only on files you substantially changed** — much existing code predates the Prettier config, so formatting a whole file creates unrelated diff noise.
- **Stop the dev server before `npm run build`** — both use `.next`.
- No Python on this machine; for scripted edits use Node, and avoid apostrophes inside single-quoted `node -e` bodies.

## Current State Summary
All MVP scope plus Build The Estimate and Generate SOW are built and committed. **This session**: fixed estimate unit conversion (days/weeks were priced as hours) — explicit units, hours-based pricing via one resolver, hours-per-day stored per version, missing units flagged for PM review, and legacy versions flagged rather than altered (migration applied to the Neon DB). Tests (420), typecheck, lint and production build are clean; still to do: a live browser check of the Review screen (needs sign-in) and a commit, pending user review.
