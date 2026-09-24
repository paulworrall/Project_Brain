# Project Brain — Codebase Summary

## Architecture Overview
Next.js 16 (App Router, TypeScript, Turbopack) with Tailwind CSS v4, Prisma 7 (Postgres/Neon, driver-adapter-based), and NextAuth v5 (beta) for email/password auth. All Level 1 MVP scope (Stages 1-5, Knowledge Upload, Chatbot, polish/QA/deploy) is complete, plus post-MVP additions: a Phase-grouped Stage Tracker (`src/lib/phases.ts`), Client/Workstream taxonomy navigation + global search, Phase 1 as a fluid workspace, commercial documents in one shared "document has many Versions, exactly one current" pattern (MSA, Rate Cards, SOW Template Library), the "Capabilities & Estimate Brief" panel, "Build The Estimate" (Stage 6), "Generate SOW" (Stage 8), brief key attributes, and the PM perspective.

**Key details are a single source of truth (this session's fix)**: budget, objective, timeline, client contact, scope, markets, languages and channels live only in the key-details record (`BriefAttributeValue`). Intake reads them first (flat-facts extraction that the API accepts), then the Position Document is told to leave them out and a de-dup check (`position-key-detail-filter.ts`) removes any "Other details" item they already cover. The Position Document no longer stores the contact. Extraction failures are recorded on the project (`getBriefCompleteness().extractionFailure`). SOW, specialist brief and chatbot read key details via `src/lib/keyDetailsContext.ts`. Existing projects were backfilled by `scripts/backfill-key-details.mts`.

**PM perspective**: five optional PM fields (Context, Initial thoughts, Proposed solution, Consultancy guidance, Early KPIs — config in `src/lib/pmPerspective.ts`) captured on the New Project form below the brief and editable in Phase 1's own "PM's view — not from the client" panel, each recording its last edit time and author. Stored in `PmPerspectiveEntry`, never merged into the brief. Agents get it only via `formatPmPerspectiveForPrompt` — a separate `<pm_perspective>` block that must never be presented as the client's words: the Position Document (intake + every Additional Input), the clarification email, and the specialist brief / capability suggestions. Brief classification and key-attribute extraction never see it. Early KPIs are offered as a PM_ENTRY suggestion for the Objective's success measures (`pmSuggestion`, kept apart from client suggestions), still needing PM confirmation.

**Brief key attributes**: `src/lib/briefAttributes.ts` is the one definition of what a complete brief contains — 4 required attributes (Budget, Objective, Timeline and Key Milestones, Client Contact) and optional ones (scope, markets, languages, channels), each with a question and sub-fields. `getBriefCompleteness(projectId)` is the only place status (missing/partial/confirmed) and the `canProceed` flag are decided. AI extraction only ever writes **suggestions**; only a PM confirms. **Generate SOW is refused until all 4 required attributes are confirmed**, with an alert listing exactly what's missing (inline fill-in forms). Projects already past Phase 1 get a warning, not a lock-out. Later features (the "What We Need to Find Out" checklist, the client email's open questions, the SOW PM review) are meant to read `getBriefCompleteness()` — not built yet.

**Build The Estimate**: "+ New estimate" (a modal running the whole flow) or the estimate's own page. Adding a role is one step; extraction + rate-card matching run automatically. An unconfirmed rate-card line or a missing/ambiguous unit sits in `RoleResolutionReview` and blocks saving. Every quantity has an explicit `EstimateUnit` and is priced as hours × hourly-equivalent rate, with factors only from `getConversionFactors(project)` (7.5 hrs/day, 5 days/week, stored per version). Versions saved before that fix are flagged `needsRecalculation`, never altered.

**Generate SOW**: pick a SOW Template, click "Generate SOW" (gated as above); the app assembles everything captured about the project into an AI-drafted `.docx` guided by the template. Regenerating appends a version.

## File Inventory

### Source Files — Key details single source of truth (this session)
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `src/services/agents/key-attribute-extraction.ts` | Flat `{ facts: [{ field, value, date, evidence }] }` schema (the nested one was rejected by the API); ids from the config, validated in code | Key details fix |
| `src/services/agents/position-key-detail-filter.ts` | `removeItemsCoveredByKeyDetails` — removes only "Other details" items about a key detail that it already covers; keeps everything on failure | Key details fix |
| `src/lib/keyAttributeSources.ts` | Extraction outcome recording, `extractKeyAttributesRecordingOutcome`, `suggestKeyAttributesFromProjectSources` (the suggest action + backfill) | Key details fix |
| `src/lib/keyDetailsContext.ts` | `formatKeyDetailsForPrompt` (confirmed ± marked suggestions), `describeKnownKeyDetails`, `confirmedText` | Key details fix |
| `src/lib/briefAttributes.ts` | + `describeKeyAttributeFieldsForPrompt`, `describeKeyAttributesForPrompt`, `keyDetailsExclusionForPrompt`, `CLIENT_CONTACT_FIELDS` | Key details fix |
| `src/types/intake.ts` | `PositionDocumentExtractionSchema` (no contact fields) vs stored `PositionDocumentFieldsSchema` (contact optional, legacy); `IntakeAgentResult.keyAttributes/keyAttributesError` | Key details fix |
| `src/services/agents/{intake-agent,clarification-extraction,chatbot}.ts`, `src/lib/sow-context.ts`, `projects/{new,[projectId]}/actions.ts` | New intake order, exclusion + de-dup, contact from key details, key details in SOW/specialist/chatbot context | Key details fix |
| `prisma/schema.prisma` + migration `20260924120000_add_key_attribute_extraction_status` | `Project.keyAttributeExtractionFailedAt/Error`. Additive | Key details fix |
| `scripts/backfill-key-details.mts`, `scripts/smoke-{key-attribute-extraction,intake}.mts` | One-off backfill (dry run default, `--apply`); live API smoke checks — not in the test suite | Key details fix |

### Source Files — PM perspective
| File | Purpose | Last Modified Task |
|------|---------|-------------------|
| `src/lib/pmPerspective.ts` | Field config, the single prompt formatter + `pmPerspectivePromptSection`, Position Document guidance, form parsing (`pm_<id>` inputs). Prisma-free | PM perspective |
| `src/lib/pmPerspectiveStore.ts` | `getPmPerspective`, `getPmPerspectiveValues`, `savePmPerspective` (changed fields only; re-offers KPI suggestion only when a linked field changes) | PM perspective |
| `prisma/schema.prisma` + migration `20260924090000_add_pm_perspective_entries` | `PmPerspectiveEntry` (unique per project + field, content, updatedBy, updatedAt). Additive only | PM perspective |
| `src/services/agents/{intake-agent,clarification-extraction}.ts` | Optional `pmPerspective` argument → labelled block in the Position Document and email prompts | PM perspective |
| `projects/new/actions.ts`, `projects/[projectId]/actions.ts` | Save at intake; `updatePmPerspectiveFieldAction`; pass to upload extraction and `assembleCapabilityBriefContext` | PM perspective |
| `src/lib/briefAttributes.ts` (`pmPerspectiveFieldId`), `briefCompleteness.ts` (`pmSuggestion`), `briefAttributeSuggestions.ts` (`savePmPerspectiveSuggestions`) | The only link from PM content to key attributes: Early KPIs → Objective success measures, as a PM_ENTRY suggestion | PM perspective |
| `PmPerspectiveFields.tsx` (New Project form, controlled), `PmPerspectivePanel.tsx` (Phase 1), `KeyAttributesPanel.tsx`, `Phase1Workspace.tsx`, `ProjectWorkflow.tsx`, `NewProjectForm.tsx`, `page.tsx` | UI | PM perspective |

### Source Files — Brief key attributes
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

Removed in the key-attributes session: `src/lib/foundationDetails.ts`, `FoundationDetailsBlock.tsx` (the old keyword-matched "5 of 5" readiness).

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

### Test Files (72 files, 488 tests, all passing)
| File | Tests | Status |
|------|-------|--------|
| `tests/services/{key-attribute-extraction,position-key-detail-filter}.test.ts`, `tests/fixtures/keyAttributeFacts.ts` | Flat-schema regression guard, fact grouping/validation, de-dup removes only covered items and keeps all on failure | ✅ New |
| `tests/services/{intake-agent,clarification-extraction}.test.ts`, `tests/{brief-key-attributes,pm-perspective,stage-1-5-happy-path,sow-context,chatbot-isolation}.test.ts` | New intake order, exclusion, no contact fields, failure recorded/cleared, SOW contact only from confirmed key detail, chatbot isolation for key details | ✅ Updated |
| `tests/lib/pmPerspective.test.ts`, `tests/pm-perspective.test.ts` (real DB), `tests/components/PmPerspectivePanel.test.tsx`, `tests/fixtures/pmPerspective.ts` | Config + labelled prompt block; empty submission; separate storage; per-field author/time; prompts include the block but key-attribute extraction doesn't; KPI → PM_ENTRY suggestion only; panel labelling and editing | ✅ New |
| `tests/services/{intake-agent,clarification-extraction}.test.ts`, `tests/lib/briefCompleteness.test.ts`, `tests/components/{NewProjectForm,Phase1Workspace,ProjectWorkflow}.test.tsx`, `tests/create-project-msa-requirement.test.ts` | Extended for the PM perspective (prompt separation, `pmSuggestion`, form section, Phase 1 separation, auth mock) | ✅ |
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
- **Dev and production share one Neon DB** — a migration goes live the moment it's applied, while production still runs the old code until the next deploy. Keep schema changes additive/backward-compatible, or apply them right before deploying. The same goes for **data backfills that change a stored JSON shape** (e.g. dropping a field an older schema requires): ship them together with the code that reads the new shape.
- **Mocked AI tests can't catch API-side rejections** (e.g. a structured-output schema too large to compile). After adding or changing any agent schema, run a live smoke check (`scripts/smoke-*.mts`) before shipping, and never let a non-fatal step fail silently — record the failure somewhere visible.
- **Prompting an agent to leave something out isn't a guarantee** — it will rename it. Where "recorded once" matters, add a separate check plus deterministic code that does the removal.
- **Shared DB with real user-created data** — inspect the affected rows (read-only) before writing a migration that touches an existing table.
- **`zodOutputFormat` does not enforce `z.enum`**, and hoists nested objects into `$defs`. Don't rely on an enum to constrain agent output; accept a string and normalize/validate in code.
- **Any file importing a Server Action that calls `auth()` needs `vi.mock("@/lib/auth")` in its test** — next-auth can't load outside Next.
- **Controlled inputs on forms using a Server Action** — React resets uncontrolled fields after a form action, so anything that must survive a failed submission/retry (the brief, the PM perspective) is controlled state.
- **Adding a Claude call to an existing flow shifts every `mockResolvedValueOnce` queue** in tests that drive that flow — update them (and their call counts) together.
- **Keep Prisma runtime imports out of client components** — shared pure helpers go in Prisma-free modules (e.g. `src/lib/briefAttributeValues.ts`, `src/lib/estimateUnits.ts`); type-only imports are fine.
- **Prisma `Decimal` isn't JSON-serializable across the Server→Client boundary** — convert to `Number` server-side (`Date` is fine).
- **`react-hooks/set-state-in-effect`**: react to an action's result inside the action function, not a `useEffect` watching `pending`.
- **API download routes need their own session check** — `src/proxy.ts`'s matcher excludes `/api/*`.
- **Run `npx prettier --write` only on new or substantially changed files** — much existing code predates the Prettier config.
- **Stop the dev server before `npm run build`** — both use `.next`.
- **Scripted edits**: no Python on this machine; use Node. Many files are CRLF — normalize to LF while editing and restore on write. The shell tool mangles apostrophes and backslashes in heredocs, so write edit scripts to the scratchpad with the Write tool first.

## Current State Summary
All MVP scope plus Build The Estimate, Generate SOW, brief key attributes and the PM perspective are built. **This session**: fixed key-detail extraction (it had never worked — the API rejected its schema) and made each key detail recorded once (key-details record only; Position Document de-duplicated and no longer holds the contact), with failures now recorded; the 9 existing projects were backfilled. Tests (488), typecheck and lint clean; committed `0685340`, deployed. Next: the UI pass on key details (a clearer label than "Missing" when a suggestion exists, and surfacing `extractionFailure`), then moving "What We Need to Find Out" / the client email / the SOW PM review onto `getBriefCompleteness()`; propagate later PM edits to generated documents; remove the Draft Scope.
