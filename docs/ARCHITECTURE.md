# ARCHITECTURE.md

Status: Phase 0 planning document, updated with the Phase 1, Phase 2, Phase 3, and Phase 4 as-built records.
Date: 2026-06-12

Core principle: **LLM recommends. Rules permit. Human approves. Execution obeys.**

Kalshi Project OS is Kalshi-first, event-market-native, and Polymarket-ready. The
architecture is platform-agnostic: shared engines operate on normalized data; only
connectors and platform-specific signal modules know platform details.

## Phase 1 as built (2026-06-11)

Phase 1 (read-only Kalshi ingestion + scanner) is implemented. Actual structure:

| Path | Contents |
|---|---|
| `app/` | Next.js App Router: `layout.tsx`, `page.tsx`, `globals.css` (plain CSS from approved mockups) |
| `app/api/markets/` | API route: live Kalshi fetch with labeled fixture fallback (`source: 'live' \| 'fixture'`) |
| `components/layout/` | `Masthead`, `StatusStrip`, `PipelineRow`, `SafetyFooter` (includes static "REAL TRADING — DISABLED" panel) |
| `components/scanner/` | `FilterBar`, `ScannerTable` |
| `components/market-detail/` | `DetailPanel` |
| `lib/platforms/kalshi/` | `client.ts`, `connector.ts`, `normalize.ts`, `types.ts` — read-only, no credentials |
| `lib/markets/` | Normalized market `types.ts`, `filters.ts` (factual data flags only) |
| `lib/utils/` | `format.ts` |
| `tests/` | Vitest unit tests: client, normalize, filters, fixture parsing — network-free |
| `tests/fixtures/` | Checked-in Kalshi markets/events JSON used for tests and fixture fallback |

Not built yet (future phases per the plan below): `lib/risk/`, `lib/paper/`,
`lib/research/`, `lib/strategies/`, `lib/wallet-intelligence/`, `lib/backtesting/`,
`lib/simulation/`, `lib/relationship-graph/`, `lib/telemetry/`, `lib/calibration/`,
`lib/db/`, `scripts/`. Phase 1 renders no verdicts; the UI shows factual flags plus
"not evaluated". (Superseded in part by the Phase 2 record below: `lib/risk/` and
`lib/research/` now exist as described there.)

## Phase 2 as built (2026-06-11)

Phase 2 bundles pipeline stages 02 Understand, 03 Research/Predict, and 04
Validate/Risk into one milestone. The Phase 1 detail panel evolved into a read-only
decision dossier; a deterministic risk engine renders SKIP / WATCH / PAPER_TRADE.
New module boundaries (all pure: no network, no LLM, no clock — timestamps are
always injected by the caller):

| Path | Responsibility | Boundary |
|---|---|---|
| `lib/understanding/` | Deterministic contract parsing: resolution clarity, settlement source status, important dates, ambiguity flags, missing fields | Parsing only; derived purely from the normalized market payload, nothing guessed |
| `lib/research/` | Research brief scaffolding with safe states `not_run` / `sourced` / `fixture` / `unavailable`; Phase 2 live builds only `not_run` briefs | Evidence only; advisory; no source = low confidence, citations never fabricated |
| `lib/probability/` | Probability estimate math: implied probability from bid/ask midpoint (or last price, labeled weaker); fair range null without sourced research | Math only; advisory; never invents an edge from price data alone |
| `lib/risk/` | Deterministic verdicts via `evaluateTradeCandidate` over `RISK_CONSTANTS` | Sole verdict authority; LLM-free; pure (no fetch/http, no `process.env`, no `Date.now()`/`new Date()`); enforced by a static source-scan test |
| `lib/dossier/` | Composition glue: `buildMarketDossier` bundles the four stage outputs; `summarizeEvaluations` tallies pipeline counts | Glue only; adds no judgment, never alters a verdict, never invents data |

Integration is entirely client-side: `app/page.tsx` derives the dossier and the
pipeline counts from the already-fetched normalized market list with one timestamp
per refresh. **No new API routes were added in Phase 2** — `app/api/markets` remains
the only route. Nothing is persisted; every dossier carries `source: 'derived'`.

Verdict algorithm (exact, implemented in `lib/risk/evaluateTradeCandidate.ts`):

1. Any hard-fail check except `written_thesis` ⇒ SKIP.
2. No hard fails, but the thesis is missing ⇒ WATCH (a missing thesis never turns
   an otherwise clean candidate into SKIP).
3. No hard fails, but any warning check (e.g. thin liquidity) ⇒ WATCH.
4. No hard fails, no warnings, thesis present ⇒ PAPER_TRADE (eligibility only —
   no paper journal exists yet).

Still not built (future phases): `lib/paper/`, `lib/strategies/`,
`lib/wallet-intelligence/`, `lib/backtesting/`, `lib/simulation/`,
`lib/relationship-graph/`, `lib/telemetry/`, `lib/calibration/`, `lib/db/`,
`scripts/`. No journal, no PnL, no settlement, no calibration, no execution.

## Phase 3 module boundaries (2026-06-11, approved)

Phase 3 adds local persistence for the research-to-thesis loop. It defines one new
module and one new API route group. Nothing else gains persistence, and the risk
engine is unchanged.

| Path | Responsibility | Boundary |
|---|---|---|
| `lib/research-store/` | SQLite-backed local persistence (via `better-sqlite3`) for research sources, manual research briefs, human-entered fair-probability estimates, and written theses. Database file lives under the gitignored `.kalshi-os/` directory. | Server-side only — never imported by client components. The ONLY module allowed to touch the database or read the `KALSHI_DATA_DIR` env override (read solely inside `lib/research-store/db.ts`). Store functions take an explicit db handle and an injected `nowIso`; no clock calls inside the module. `lib/risk/` NEVER imports it; persisted research reaches the risk engine only as plain data mapped through `lib/dossier`. No trading, order, account, auth, wallet, or key data — research and thesis records only. |
| `app/api/research/**` | Research-only mutation routes: CRUD for sources, briefs, probability estimates, and theses (GET/POST/PATCH only; no PUT, no DELETE — archived records remain as an audit trail). | The ONLY route group permitted to expose mutations in V1. Trading, order, account, auth, and wallet mutations remain forbidden everywhere. `app/api/markets` stays GET-only. Enforced by route-aware safety tests. |

`lib/research-store/` supersedes the planned generic `lib/db/` entry below for the
research/thesis domain; a broader persistence layer remains a future-phase decision.

## Phase 3 as built (2026-06-11)

Phase 3 implemented the research-to-thesis loop exactly within the approved
boundaries above. Actual structure:

| Path | Contents |
|---|---|
| `lib/research-store/` | `db.ts` (lazy open, WAL + busy_timeout, `globalThis` connection cache keyed by resolved data dir; the ONLY file that reads `KALSHI_DATA_DIR`), `schema.ts` (DDL strings with CHECK-constrained enums), `migrations.ts` (versioned, idempotent, ledger-backed via `schema_migrations`), `types.ts` (row/record shapes, DTOs, and the units convention stated once), `validation.ts` (payload, brief-state, fair-range, and `validateThesisReady` rules), `sources.ts`, `briefs.ts`, `probabilityEstimates.ts`, `theses.ts` (CRUD with server-authoritative counts and the ready-transition gate), `summary.ts` (recomputed per-ticker summary flags) |
| `app/api/research/` | Bulk summary GET (`route.ts`), per-ticker GET, `POST sources` / `PATCH sources/[sourceId]`, `POST brief`, `POST probability`, `POST thesis` / `PATCH thesis/[thesisId]`, plus non-route helpers (`route-helpers.ts`, `[ticker]/thesis/payload.ts`) |
| `lib/dossier/` (additions only) | `PersistedResearchSnapshot` / `PersistedSourceSnapshot` structural DTOs in `types.ts`, `mapResearchState.ts`, `buildMarketDossierWithResearch(market, snapshot \| null, nowIso)`; `summarizeEvaluations` gained an optional per-ticker snapshot map |
| `components/market-detail/` (additions) | `SourcesPanel`, `ThesisPanel`, manual editors in `ResearchBriefPanel` / `ProbabilityPanel`, shared form DTOs in `researchActions.ts` |
| `tests/` (additions) | `research-store-db`, `research-store-validation`, `research-store-crud`, `research-api`, `phase3-integration`, `safety-routes` |

Dependency direction (enforced by tests and review):

- `app/api/research/**` routes → `lib/research-store`. Routes are thin: one
  injected timestamp per request, validation first, store calls second. No other
  module imports `better-sqlite3` or touches the database.
- `app/page.tsx` fetches `/api/research` (bulk summaries) and
  `/api/research/[ticker]` (full state) over HTTP and converts the responses into
  the structural snapshot DTO. **`lib/dossier` imports nothing from
  `lib/research-store`** — persisted research crosses the boundary as plain JSON
  data shaped like `PersistedResearchSnapshot`, mirroring the existing
  `ResearchLike` precedent. The dossier purity scan (no fetch, no clock, no env)
  still passes over every `lib/dossier` file.
- **`lib/risk` imports nothing new and has zero changes.** Persisted research
  reaches the engine only as already-mapped candidate fields through the
  unchanged `RiskCandidate` shape.

Behavioral notes:

- Bulk summaries deliberately omit source lists and brief bodies; the snapshot
  built from a bulk summary is conservative (fair values stay null, brief state
  is inferred only as far as the flags allow). The selected market's full
  per-ticker snapshot overrides its bulk entry, so the dossier on screen always
  reflects real rows.
- Summary flags (`hasReadyThesis`, `hasFairProbability`, `hasHumanReviewedBrief`)
  are recomputed against current rows on every read — never echoed from stored
  values — so a thesis whose linked source was later rejected decays back to
  not-ready everywhere at once.
- Route-aware safety tests (`tests/safety-routes.test.ts`) enumerate every
  `app/api/**/route.ts` file: `/api/markets` exports GET only; `/api/research/**`
  may export GET/POST/PATCH only; no PUT/DELETE anywhere; no mutations outside
  `/api/research/**`; no route path contains trading/account/auth/wallet
  segments. New routes are checked automatically.

## Phase 4 module boundaries (2026-06-12, approved)

Phase 4 adds (1) human-verified settlement-source records and (2) a paper-only
decision journal. Settlement verification is **resolution-authority verification**
— a dedicated record confirming who settles the market — and is deliberately
separate from research evidence: Phase 3 research sources, including accepted
`official_resolution_source` rows, never verify settlement. The risk engine is
byte-unchanged; a verified settlement record reaches it only through a **pure
settlement overlay in `lib/dossier`** that flips the understanding's settlement
status to `'provided'` before evaluation (composition, not rule change).

Phase 4 keeps the SQLite core housed in lib/research-store for continuity; a
future lib/local-store refactor is deferred.

| Path | Responsibility | Boundary |
|---|---|---|
| `lib/dossier/applySettlementVerification.ts` | Pure overlay: a `human_verified` settlement snapshot sets `settlementSourceStatus: 'provided'` on a NEW understanding object; draft/rejected/absent records change nothing. | Pure (no DB/fetch/env/clock); never touches resolution clarity or ambiguity flags; `lib/dossier` still imports nothing from `lib/research-store`; `lib/risk` unchanged. |
| `lib/paper/` | Pure paper-decision eligibility rules (`evaluatePaperEligibility(dossier)`): eligible only when the deterministic verdict is `PAPER_TRADE`. | Pure logic only — no persistence, no routes, no execution, no PnL/lifecycle concepts. Eligibility is read from the risk verdict, never decided independently. |
| `lib/research-store/settlementSources.ts` | CRUD for settlement-source records (`draft` / `human_verified` / `rejected`; no deletes); "active verified" = latest `human_verified` row. | Same store conventions: explicit db handle, injected timestamps, server-side validation. |
| `lib/research-store/paperJournal.ts` | Paper decision entries: simulated decision snapshots only (create, list, archive). No stake, contracts, PnL, lifecycle, settlement outcome, or portfolio data. | Entries are creatable only from a server-validated `PAPER_TRADE`-eligible dossier; archive-only mutation after creation. |
| `lib/research-store/snapshot.ts` | `toPersistedResearchSnapshot(state)`: maps persisted research state (incl. settlement records) to the structural dossier snapshot DTO, shared by client and server. | Store → dossier-types import direction only; the reverse stays forbidden. |
| `app/api/research/[ticker]/settlement-source/**` | Settlement-source routes (GET/POST/PATCH only) inside the existing research mutation namespace. | Same rules as all `/api/research/**` routes: no PUT/DELETE, thin handlers, injected timestamp per request. |
| `app/api/paper-journal/**` | Paper-only decision-journal routes (GET/POST/PATCH only). POST re-derives the dossier server-side and rejects (409) anything that is not `PAPER_TRADE`. | Second and last permitted mutation namespace in V1. No trading/account/credential surfaces; route-aware safety tests enforce GET/POST/PATCH and forbidden-segment rules automatically. |
| `app/api/markets/loadMarkets.ts` | Shared server market loader (fetch + fixture fallback + junk filter) extracted from the markets route, reused by the paper-journal POST. | Read-only. The only file that reads the read-only `KALSHI_MARKETS_SOURCE=fixture` toggle (per-call), used for deterministic smoke/testing; never a mutation surface. |

## Phase 4 as built (2026-06-12)

Phase 4 implemented settlement verification and the paper decision journal exactly
within the approved boundaries above. Actual structure:

| Path | Contents |
|---|---|
| `lib/research-store/` (additions) | Migration v2 in `migrations.ts`; `schema.ts` gains `market_settlement_sources` and `paper_decision_entries` DDL (+ ticker indexes); `types.ts` gains the settlement/paper enums, `SettlementSourceRow/Record`, `VerifiedSettlementSummary`, `PaperDecisionEntryRow/Record`, and extends `ResearchSummary` (`verifiedSettlementSource`) and `ResearchStateResponse` (`settlementSources`); `validation.ts` gains `validateSettlementSourceInput` (strict field requirements for `human_verified`) and `validatePaperEntryInput`; `settlementSources.ts` (create/list/get/update + `getActiveVerifiedSettlementSource`); `paperJournal.ts` (create/list/get/archive — archive is the only post-creation mutation); `snapshot.ts` (`toPersistedResearchSnapshot`, shared by client and server); `summary.ts` recomputes `verifiedSettlementSource` from current rows on every read and its ticker UNION includes `market_settlement_sources` |
| `lib/dossier/` (additions) | `applySettlementVerification.ts` (pure overlay; only path that ever yields `settlementSourceStatus: 'provided'`); `PersistedSettlementVerificationSnapshot` in `types.ts`; `PersistedResearchSnapshot` gains optional `settlementVerification`; `buildMarketDossierWithResearch` applies the overlay to the understanding before risk evaluation |
| `lib/paper/` | `types.ts` (`PaperEligibility`), `eligibility.ts` (`evaluatePaperEligibility(dossier)`: eligible only when the verdict is `PAPER_TRADE` and a current YES ask exists; reads the verdict, never recomputes it) |
| `app/api/research/[ticker]/settlement-source/` | `route.ts` (GET state + active verified summary; POST create, default `draft`), `[settlementSourceId]/route.ts` (PATCH; transitions into `human_verified` re-run the strict validator and 400 on failure) |
| `app/api/paper-journal/` | `route.ts` (GET all entries), `[ticker]/route.ts` (GET per ticker), `[ticker]/entries/route.ts` (POST; server re-derives the dossier and returns 409 unless the verdict is `PAPER_TRADE` and a current YES ask exists), `entries/[entryId]/route.ts` (PATCH; body exactly `{status:'archived'}`) |
| `app/api/markets/` | `loadMarkets.ts` (`loadCurrentMarkets()`: live fetch + fixture fallback + junk filter + per-call `KALSHI_MARKETS_SOURCE` read); `route.ts` is now a thin GET wrapper |
| `components/market-detail/` (additions) | `SettlementVerificationPanel.tsx` (after the contract-understanding panel), `PaperJournalPanel.tsx` (after the risk panel; log button enabled only on a `PAPER_TRADE` verdict, rendered disabled otherwise); `researchActions.ts` gains settlement and paper-journal action types |
| `tests/` (additions) | `settlement-api`, `settlement-overlay` (includes the first real-pipeline `PAPER_TRADE` end-to-end), `paper-journal-store`, `paper-journal-api`; `safety-routes`, `research-api`, `research-store-*`, and `fixture-parsing` extended |
| `tests/fixtures/` | Synthetic market `SYNTH-PAPER-DEMO` (+ matching event) appended so the full pipeline can reach `PAPER_TRADE` deterministically in fixture mode; it derives `settlementSourceStatus: 'unverified'` like any market — the overlay is never special-cased |

Dependency directions (unchanged and re-verified):

- `lib/dossier` still imports nothing from `lib/research-store`; settlement
  verification crosses the boundary as the plain structural
  `PersistedSettlementVerificationSnapshot` DTO. The dossier purity scan still
  passes over every `lib/dossier` file.
- **`lib/risk` has zero changes — byte-for-byte identical.** The overlay only
  changes an input value (`settlementSourceStatus`) that the unchanged
  `settlement_source` check already knew how to read.
- `lib/paper` is pure logic with no persistence, routes, or clock; it consumes
  a composed dossier and re-states the engine's verdict as eligibility.
- `better-sqlite3` remains confined to `lib/research-store`; the paper-journal
  routes reach storage only through store functions with injected timestamps.

The planned-layout row for `lib/paper/` below ("entries, exits, paper PnL") is
superseded for V1 by this phase: the as-built journal records decision
snapshots only — exits, paper PnL, and outcome tracking stay deferred to a
future explicitly approved phase.

## Planned directory layout (future phases)

The table below is the Phase 0 plan for later phases. Directories not listed in the
"as built" section above still do not exist and are not created before their phase is
explicitly approved by the human.

| Path | Responsibility | Notes |
|---|---|---|
| `lib/platforms/` | `MarketConnector` interface, `KalshiConnector`, `PolymarketConnector`, normalization | No trading credentials in V1 |
| `lib/risk/` | Deterministic risk engine | LLM-free. No AI imports, ever. Sole verdict authority |
| `lib/paper/` | Paper-trading journal: entries, exits, paper PnL | No real orders |
| `lib/research/` | Source-grounded research engine, contract understanding, AI briefs | Advisory output only |
| `lib/strategies/` | Strategy modules (weather, stale-market, econ-release, etc.) | Emit `StrategySignal` only |
| `lib/wallet-intelligence/` | Polymarket smart-wallet tracking and scoring | Emits signals, never trades. Future phase |
| `lib/backtesting/` | Historical strategy evaluation | Future phase |
| `lib/simulation/` | Probability/outcome simulation, distributions | Future phase |
| `lib/relationship-graph/` | Related-market / cross-platform consistency signals | Signal-only. Future phase |
| `lib/telemetry/` | Pipeline-stage visibility, audit logs, dashboards data | No dopamine UX |
| `lib/calibration/` | Predicted-vs-actual tracking, calibration bins, Brier score later | |
| `lib/db/` | Persistence access layer | Physical schema designed in a later phase |
| `scripts/` | Operational scripts (snapshots, settlement checks) | No order placement scripts in V1 |
| `tests/` | Unit + integration tests | Risk engine requires exhaustive deterministic tests |

## MarketConnector interface (concept only — pseudocode, no source files yet)

```text
interface MarketConnector
  platform(): PlatformId                       // 'kalshi' | 'polymarket'
  capabilities(): ConnectorCapabilities        // feature flags, see below
  fetchMarkets(filter): NormalizedMarket[]     // active markets, normalized fields
  fetchMarketDetail(marketId): NormalizedMarketDetail
                                               // rules text, resolution criteria,
                                               // settlement source, expiry, status
  fetchOrderbookOrPrices(marketId): PriceState // bid/ask, spread, depth where available
  fetchSnapshot(marketId): MarketSnapshot      // point-in-time prices/volume/OI

ConnectorCapabilities (flags, examples):
  hasOrderbook: bool          // Kalshi yes; Polymarket per market type
  hasOpenInterest: bool
  hasWalletVisibility: bool   // Polymarket-only; Kalshi likely false
  hasPublicTraderActivity: bool
```

Connector rules:

- Connectors are read-only market-data adapters in V1. No order endpoints, no trading
  API keys, no account/auth secrets. Market-data access only.
- Platform-specific capabilities are flagged, not assumed. Shared engines must check
  `capabilities()` instead of hardcoding platform behavior.
- All connector output is normalized before any shared engine touches it.

## Shared engines vs platform-specific modules

Shared (operate on normalized data, platform-agnostic):

- Market normalization, contract understanding, research engine, probability engine,
  risk engine, paper-trading engine, calibration engine, strategy framework.

Platform-specific:

- `KalshiConnector`: market/orderbook/volume/open-interest signals.
- `PolymarketConnector`: market data plus public wallet/trader activity.
- `lib/wallet-intelligence/`: Polymarket-oriented; degrades to disabled on platforms
  without wallet visibility.

## Data-flow pipeline — V1 (Training Wheels Mode, paper-only)

```text
01 Scan            -> pull + normalize markets (connectors)
02 Understand      -> parse contract wording, resolution criteria, settlement source
03 Research/Predict-> gather sources, build AIBrief, estimate fair probability range
04 Validate/Risk   -> deterministic risk engine: SKIP | WATCH | PAPER_TRADE
05 Paper/Simulate  -> log PaperTrade with thesis; simulate where applicable
06 Settle/Learn    -> record Outcome, paper PnL, update calibration + scorecards
```

## Future locked pipeline (NOT V1)

```text
01 Scan -> 02 Understand -> 03 Research/Predict -> 04 Validate/Risk
        -> 05 Size -> 06 Execute -> 07 Settle/Learn
```

The execution module is isolated and locked. It does not exist in V1, is never imported
by V1 code paths, and is unlocked only in a future phase with explicit human approval.
No market orders. No auto-trading.

## Boundary rules (enforced in review and tests)

1. Strategies emit `StrategySignal` objects only. They never place trades, paper or
   real, and never call the paper engine directly.
2. The risk engine is the sole verdict authority. Only it produces SKIP / WATCH /
   PAPER_TRADE (and the locked REAL_TRADE_ELIGIBLE_LATER in future phases).
3. The risk engine is deterministic and LLM-free: hard-coded rules, no model calls,
   no prompt-derived thresholds.
4. LLM components (research, briefs, summaries) are advisory only. LLM output never
   approves, sizes, or executes anything.
5. Wallet-intelligence output is a signal input to research/risk, never an approval.
6. Connectors never contain trading credentials in V1. No API keys or secrets in repo.
7. Default verdict is SKIP. Ambiguous resolution criteria, wide spread, thin liquidity,
   small edge, or missing thesis all force SKIP.

## Definition of done for this document

- A future session can name every planned module and its boundary without re-asking.
- No directory listed here is created until Phase 1 approval.
