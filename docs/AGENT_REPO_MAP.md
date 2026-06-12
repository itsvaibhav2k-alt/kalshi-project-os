# AGENT_REPO_MAP.md

Status: compact codebase map for Claude/Hermes agents
Date: 2026-06-12 (updated through Phase 4)
Purpose: reduce repeated full-repo scanning. Read this after `CLAUDE.md` and before planning implementation work. This map is a navigation aid, not a substitute for reading the exact files you will edit.

## Mission and safety invariants

Kalshi Project OS is a Kalshi-first, event-market-native, paper-only research OS. V1 Training Wheels mode remains active.

Non-negotiables:

- No real-money execution.
- No auto-trading.
- No live order placement.
- No market orders.
- No trading API keys, auth, account, broker, wallet, or execution routes.
- No Polymarket until explicitly approved.
- Default verdict is SKIP.
- Deterministic risk engine is the only verdict authority.
- LLM/research/probability/thesis outputs are advisory only.
- `REAL_TRADE_ELIGIBLE_LATER` is design-only and must not be representable in runtime verdicts.

Core principle: LLM recommends. Rules permit. Human approves. Execution obeys.

## Stack

- Next.js App Router, React 19, TypeScript.
- Tests: Vitest via `npm test`.
- Local persistence: SQLite via `better-sqlite3`.
- Database path: `.kalshi-os/kalshi-os.sqlite` by default, gitignored.
- Test/data-dir override: `KALSHI_DATA_DIR`.

Commands:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `npm run dev -- --port 3456`

Known dev-server gotcha: running `npm run build` while `next dev` is live can rewrite `.next` and cause transient 500s like missing chunk modules. Restart dev server before judging browser smoke. The `next-server` child can also outlive its `npm run dev` wrapper, leaving an orphan that races a newly started dev server on the same `.next` (same missing-chunk 500s). Clean restart: kill ALL `next dev`/`next-server` processes (not just the port listener), `rm -rf .next`, then start one dev server.

## Current implemented phases

### Phase 1

Read-only Kalshi scanner.

### Phase 2

Decision dossier:

- deterministic contract understanding
- safe research `not_run` state
- market-implied probability
- pure deterministic risk engine
- dossier UI

### Phase 3

SQLite-backed research-to-thesis loop:

- accepted/draft/rejected human sources
- manual / human-reviewed research brief
- human-entered fair probability range
- written thesis
- persisted research summary feeding the dossier/risk candidate
- route-aware safety tests for research-only mutations

### Phase 4

Settlement verification + paper decision journal:

- dedicated human-verified settlement-source records (`draft`/`human_verified`/`rejected`, no deletes); research sources still never verify settlement
- pure settlement overlay in `lib/dossier` flips `settlementSourceStatus` to `'provided'` (the only path to that value); `lib/risk` byte-unchanged
- paper decision journal: simulated decision snapshots only (no stake/contracts/PnL/lifecycle/outcome); YES-side only; created only when the server re-derives a `PAPER_TRADE` verdict (else 409); archive-only afterwards
- `/api/paper-journal/**` is the second and last V1 mutation namespace
- shared server market loader `app/api/markets/loadMarkets.ts` with the read-only `KALSHI_MARKETS_SOURCE=fixture` toggle and the synthetic `SYNTH-PAPER-DEMO` fixture market for end-to-end smoke

Current live behavior: a market reaches `PAPER_TRADE` only after the full human
loop (accepted sources, human-reviewed brief, fair range with sufficient edge,
ready thesis, AND a human-verified settlement record). Without that work, live
markets still SKIP — settlement unverified and/or resolution clarity ambiguous.
Deferred: paper PnL, NO-side entries, settlement outcome tracking, calibration.

## Module map

### `app/`

- `app/page.tsx`: main client app. Fetches `/api/markets`, `/api/research`, selected ticker detail via `/api/research/[ticker]`, and paper entries via `/api/paper-journal/[ticker]`. Uses the shared `toPersistedResearchSnapshot` from `lib/research-store/snapshot.ts` (type-only/pure imports — client-safe) so client and server compose dossiers identically; `snapshotFromSummary` maps `verifiedSettlementSource` so bulk verdict counts match the selected market.
- `app/layout.tsx`: root metadata/layout.
- `app/globals.css`: all CSS, including scanner/dossier/forms (Phase 4 additions: `.record-actions`, `.paper-entry-line`).

### `app/api/markets/`

GET-only. Read-only public Kalshi market data with fixture fallback. No credentials, no account/trading endpoints.

- `route.ts`: thin GET wrapper around `loadCurrentMarkets()`.
- `loadMarkets.ts` (not a route): shared server loader — live fetch, fixture fallback, junk filter. The ONLY file that reads `KALSHI_MARKETS_SOURCE` (per call, never cached); `KALSHI_MARKETS_SOURCE=fixture` deliberately serves fixtures with `source: 'fixture'` and `error: null`. Reused by the paper-journal POST.

### `app/api/research/**`

Research/thesis/settlement CRUD only. GET/POST/PATCH allowed here; no PUT/DELETE. Server-side validation and SQLite access.

Current route groups:

- `GET /api/research`: summary map only, no full source lists/bodies (includes `verifiedSettlementSource`; ticker UNION includes settlement-only tickers).
- `GET /api/research/[ticker]`: full selected-ticker research state (includes `settlementSources`).
- `POST /api/research/[ticker]/sources`
- `PATCH /api/research/[ticker]/sources/[sourceId]`
- `POST /api/research/[ticker]/brief`
- `POST /api/research/[ticker]/probability`
- `POST /api/research/[ticker]/thesis`
- `PATCH /api/research/[ticker]/thesis/[thesisId]`
- `GET/POST /api/research/[ticker]/settlement-source` (GET → `{settlementSources, verifiedSettlementSource}`; POST defaults status `draft`)
- `PATCH /api/research/[ticker]/settlement-source/[settlementSourceId]` (transition into `human_verified` re-runs the strict validator → 400 on missing url/authorityType/rationale)

### `app/api/paper-journal/**`

Paper-only decision journal (Phase 4). The second and last permitted mutation namespace. GET/POST/PATCH only.

- `GET /api/paper-journal`: all entries → `{paperEntries}`.
- `GET /api/paper-journal/[ticker]`: per-ticker entries.
- `POST /api/paper-journal/[ticker]/entries`: optional body `{side?: 'YES'}`. Flow: `loadCurrentMarkets()` → find market by `externalId` (else 404) → `getResearchState` → `toPersistedResearchSnapshot` → `buildMarketDossierWithResearch` → verdict ≠ `PAPER_TRADE` ⇒ 409 `{error, fieldErrors: riskEvaluation.reasons}`; missing current YES ask ⇒ 409 (never falls back to last price) → 201 `{paperEntry}` snapshot.
- `PATCH /api/paper-journal/entries/[entryId]`: body exactly `{status: 'archived'}`; only `logged` rows; 404 unknown id.

### `components/layout/`

- `Masthead`, `StatusStrip`, `PipelineRow`, `SafetyFooter`.
- Pipeline row shows counts for scan/understand/manual research/risk.
- Keep copy anti-dopamine and safety-forward.

### `components/scanner/`

- `ScannerTable`: clickable market rows.
- `FilterBar`: category/status/search filters.

### `components/market-detail/`

Main dossier UI.

- `DetailPanel.tsx`: selected-market detail shell; composes subpanels.
- `ContractUnderstandingPanel.tsx`: deterministic understanding display.
- `SettlementVerificationPanel.tsx`: Phase 4 settlement-record CRUD UI (directly after the understanding panel); save-draft / mark-human-verified / reject; server remains the verification gate.
- `SourcesPanel.tsx`: Phase 3 source CRUD UI.
- `ResearchBriefPanel.tsx`: manual / human-reviewed brief UI.
- `ProbabilityPanel.tsx`: implied probability plus human fair range UI.
- `ThesisPanel.tsx`: thesis editor and ready-for-risk action.
- `RiskPanel.tsx`, `RiskCheckList.tsx`: deterministic verdict display only.
- `PaperJournalPanel.tsx`: Phase 4 paper decision journal UI (after the risk panel); "Log paper decision" button enabled ONLY on a `PAPER_TRADE` verdict (rendered disabled otherwise, never hidden); entries list + archive control; paper-only marketplace-free copy.
- `researchActions.ts`: client-side DTO/action helpers for research, settlement, and paper-journal forms (`ResearchActions`, `PaperJournalActions`).

Do not add real trade/order CTAs here. Paper journal UI uses paper-only language and always obeys the risk verdict; the server re-validates regardless.

### `lib/platforms/kalshi/`

Read-only public market connector.

- `client.ts`: public fetch helpers.
- `connector.ts`: read-only connector.
- `normalize.ts`: platform payload → normalized market.
- `types.ts`: raw Kalshi payload shapes.

No credentials, no private API, no orders/account/portfolio paths.

### `lib/markets/`

- `types.ts`: normalized market shape.
- `filters.ts`: factual data flags and filtering.

### `lib/understanding/`

Pure deterministic contract reading.

- `understandMarket.ts`: derives summary, YES/NO conditions, rules, resolution clarity, settlement source status, ambiguity flags, important dates.
- `types.ts`: `ContractUnderstanding`, `ResolutionClarity`, `SettlementSourceStatus`.

Current settlement status type: `'provided' | 'missing' | 'unverified'`. `understandMarket` never emits `'provided'` — listed settlement text derives `'unverified'`. Since Phase 4, the ONLY path to `'provided'` is the pure overlay `lib/dossier/applySettlementVerification.ts`, applied when a `human_verified` settlement record exists. Research sources never set this.

### `lib/research/`

Advisory research brief types/scaffolding.

- `buildResearchBrief.ts`: safe `not_run` / fixture helpers.
- `types.ts`: `ResearchBrief`, `ResearchSource`, `ResearchStatus`.

No fake citations. No source = low confidence.

### `lib/probability/`

Advisory probability math.

- `estimate.ts`: market-implied probability, fair range handling, expected edge.
- `types.ts`: `ProbabilityEstimate`.

Units: probabilities are fractions in `[0,1]`; UI may display percentages. Fair probability is never inferred from market price.

### `lib/risk/`

Most safety-critical module. Pure deterministic risk engine.

- `evaluateTradeCandidate.ts`: verdict algorithm and ordered checks.
- `constants.ts`: thresholds.
- `types.ts`: `RiskCandidate`, `RiskEvaluation`, verdict/check types.

Rules:

- Do not change without explicit human approval.
- No DB, fetch, env, clock, LLM, network, or side effects.
- Existing purity tests must stay green.
- Runtime verdicts are only `SKIP | WATCH | PAPER_TRADE`.

Verdict algorithm:

1. Any hard fail except missing thesis ⇒ SKIP.
2. Missing thesis only ⇒ WATCH.
3. Warnings only ⇒ WATCH.
4. All checks pass + thesis ⇒ PAPER_TRADE.

### `lib/dossier/`

Pure composition glue.

- `buildMarketDossier.ts`: `buildMarketDossier`, `buildMarketDossierWithResearch` (applies the settlement overlay to the understanding before risk evaluation), `summarizeEvaluations`.
- `applySettlementVerification.ts`: Phase 4 pure overlay. Absent/draft/rejected → same reference back; `human_verified` → NEW spread object with `settlementSourceStatus: 'provided'`, compact label, cleaned `missingFields`, appended note. Never touches `resolutionClarity`/`ambiguityFlags`.
- `mapResearchState.ts`: persisted research snapshot → engine research brief.
- `types.ts`: `MarketDossier`, `EvaluationSummary`, `PersistedResearchSnapshot` (now with optional `settlementVerification`), `PersistedSettlementVerificationSnapshot`, source snapshot DTOs.

Boundary: no DB, fetch, env, clock, or invented data. All timestamps are injected. `lib/dossier` imports nothing from `lib/research-store`.

### `lib/paper/`

Pure paper-decision eligibility (Phase 4). No persistence, routes, clock, or env.

- `eligibility.ts`: `evaluatePaperEligibility(dossier)` → `{eligible, verdict, blockers}`. Eligible only when `riskEvaluation.verdict === 'PAPER_TRADE'` AND `market.yesAskCents !== null`. Reads the verdict; never recomputes or overrides it.
- `types.ts`: `PaperEligibility`.

Client-safe (type-only imports + pure logic) — imported by `PaperJournalPanel`.

### `lib/research-store/`

Server-only SQLite persistence for research/thesis/settlement/paper-journal state (Phases 3–4). One exception to "server-only": `snapshot.ts` is pure mapping with type-only imports and is also used client-side.

- `db.ts`: lazy DB open, WAL/busy timeout, `KALSHI_DATA_DIR`, global connection cache. Only file allowed to read the env override or import/open the database.
- `schema.ts`: DDL.
- `migrations.ts`: versioned migration registry + ledger (v1 Phase 3, v2 Phase 4; append-only).
- `types.ts`: DB/API/store types and units convention. Phase 4: `SETTLEMENT_AUTHORITY_TYPES`, `SettlementVerificationStatus` (distinct from lib/understanding's `SettlementSourceStatus`), `SettlementSourceRow/Record`, `VerifiedSettlementSummary`, `PAPER_ENTRY_SIDES/STATUSES/RISK_VERDICTS`, `PaperDecisionEntryRow/Record`.
- `validation.ts`: source/brief/probability/thesis validators, `validateThesisReady`; Phase 4: `validateSettlementSourceInput` (`human_verified` requires title+url+authorityType+rationale), `validatePaperEntryInput`.
- `sources.ts`, `briefs.ts`, `probabilityEstimates.ts`, `theses.ts`: CRUD.
- `settlementSources.ts`: create/list/get/update + `getActiveVerifiedSettlementSource` (latest row with CURRENT status `human_verified`, `created_at DESC, rowid DESC`; drafts/rejected never count). Verification field requirements re-checked at the store layer.
- `paperJournal.ts`: `createPaperEntry` (re-validates verdict/side/snapshots — defense in depth; status always `logged`), `listPaperEntries`, `listAllPaperEntries`, `getPaperEntryById`, `archivePaperEntry` (only `logged` → `archived`).
- `snapshot.ts`: `toPersistedResearchSnapshot(state)` — shared client/server mapping to the dossier snapshot DTO (store → dossier-types import direction is allowed; reverse is forbidden).
- `summary.ts`: recomputed per-ticker summary flags incl. `verifiedSettlementSource`; ticker UNION covers all per-market tables incl. `market_settlement_sources`.

Existing tables:

- `schema_migrations`
- `market_sources`
- `research_briefs`
- `probability_estimates`
- `theses`
- `market_settlement_sources` (Phase 4)
- `paper_decision_entries` (Phase 4; CHECKs: side `YES` only, verdict `PAPER_TRADE` only, status `logged|archived`, fraction bounds; NO stake/contracts/PnL/lifecycle/outcome columns)

No deletes: reject/archive instead.

### `lib/utils/`

- `format.ts`: display formatting.

## Test map

Run all tests with `npm test`.

Important suites:

- `tests/risk.test.ts`: deterministic risk engine behavior.
- `tests/phase2-integration.test.ts`: Phase 2 pipeline and purity checks.
- `tests/phase3-integration.test.ts`: persisted research → dossier/risk integration.
- `tests/safety-routes.test.ts`: route/mutation safety, forbidden trading paths, token-pattern carve-out pinning, purity/import scans.
- `tests/research-store-db.test.ts`: DB/migration behavior (ledger versions [1, 2]).
- `tests/research-store-validation.test.ts`: validators incl. settlement/paper-entry validators.
- `tests/research-store-crud.test.ts`: source/brief/probability/thesis store behavior.
- `tests/research-api.test.ts`: API route validation and responses.
- `tests/settlement-api.test.ts`: settlement-source routes — draft defaults, strict verification 400s, active-verified selection/decay, research sources never affecting verification.
- `tests/settlement-overlay.test.ts`: overlay purity/reference semantics; ambiguous-market independence; the first real-pipeline `PAPER_TRADE` through `buildMarketDossierWithResearch`; `toPersistedResearchSnapshot` mapping.
- `tests/paper-journal-store.test.ts`: store rules, YES-only, boundary fractions, archive lifecycle, PRAGMA column audit (no PnL-shaped columns), `evaluatePaperEligibility`.
- `tests/paper-journal-api.test.ts`: server-side eligibility (409 paths), full 201 snapshot assertions, archive PATCH, method allowlists; uses mkdtemp `KALSHI_DATA_DIR` + `KALSHI_MARKETS_SOURCE=fixture` stubbed/restored.
- `tests/client.test.ts`, `normalize.test.ts`, `filters.test.ts`, `fixture-parsing.test.ts`: Kalshi ingestion/scanner basics; fixture parsing also covers `loadCurrentMarkets` fixture mode and the `SYNTH-PAPER-DEMO` synthetic market.

## Current safety-test expectations

- `/api/markets` exports GET only.
- `/api/research/**` and `/api/paper-journal/**` may export GET/POST/PATCH only; they are the ONLY mutation namespaces.
- No PUT/DELETE/HEAD/OPTIONS anywhere.
- No mutations outside those two namespaces unless explicitly approved in a future phase and tests updated.
- No route path may contain trading/account/auth/wallet/buy/sell/trade/portfolio/position segments (`paper-journal`, `settlement-source`, `entries`, `[entryId]`, `[settlementSourceId]` are verified clean).
- Forbidden-token content scan over `app/api/**` and `lib/research-store/**` (comments stripped, SQL `ORDER BY` excepted): `/\b(order|buy|sell|auth(?!orit)|wallet|account)/i`. The human-approved carve-out permits EXACTLY `authority`, `authorities`, `authority_type`, `authoritative`; `auth`, `authentication`, `authorization`, `authToken`, `authHeader`, `auth_key` still match. Unit tests pin both word lists — do not widen.
- Practical writing rule for those directories: avoid order/buy/sell/account/wallet/position/portfolio and non-authority `auth*` words even in comments (e.g. never "in order to").
- `better-sqlite3` import confined to `lib/research-store`.
- No browser storage: `localStorage`, `sessionStorage`, `indexedDB`.

## Phase 4 gotchas (as built)

- `KALSHI_MARKETS_SOURCE=fixture` is the deterministic smoke/test toggle: read per call, only in `app/api/markets/loadMarkets.ts`. In fixture mode the result is `source: 'fixture'`, `error: null` (a deliberate success path, distinct from fixture-fallback-on-failure which carries the real failure message). Smoke command: `KALSHI_MARKETS_SOURCE=fixture npm run dev -- --port 3456`.
- `SYNTH-PAPER-DEMO` is the synthetic fixture market (yes ask 21¢, 2¢ spread, healthy volume/OI) that can reach `PAPER_TRADE` after the full human loop. It is NOT special-cased anywhere: `understandMarket` still derives `settlementSourceStatus: 'unverified'` for it; only a `human_verified` settlement record flips that via the overlay. Fixture counts: 11 markets / 5 events; 1 junk-filtered, 10 shown.
- Paper-entry POST requires a CURRENT YES ask (`yesAskCents`); a missing ask is a 409 blocker — never fall back to last price. `paper_price` is stored as a fraction (`yesAskCents / 100`).
- "Active verified settlement source" = latest row whose CURRENT status is `human_verified` (`created_at DESC, rowid DESC`); rejecting it immediately decays verification everywhere (summaries are recomputed per read, never cached).
- `SettlementVerificationStatus` (store record: `draft|human_verified|rejected`) vs `SettlementSourceStatus` (`lib/understanding`: `provided|missing|unverified`) — distinct types, do not conflate.
- The `auth(?!orit)` carve-out exists so settlement code can say `authority_type`; everything else auth-shaped still fails the safety scan (see safety-test expectations above).
- Probabilities are fractions in [0, 1] in storage/logic; cents only at display time. Timestamps are always injected by callers.
- `PAPER_TRADE` contains "trade": fine inside file contents, forbidden in route path segments — keep it out of directory names.

## Do-not-touch list without explicit approval

- `lib/risk/**` behavior.
- Any real trading/order/account/auth/wallet code.
- Any API key/secret handling.
- Polymarket connector or wallet intelligence.
- Automated AI research/source discovery.
- Real PnL/execution dashboard language.
