# DATA_MODEL.md

Status: Phase 0 planning document, updated with the Phase 2 in-memory types and the
Phase 3 / Phase 4 persisted research-store schema.
Date: 2026-06-12

Constraints:

- No schema files, no ORM code, no migrations in Phase 0. The physical schema
  (database, tables, indexes) is designed in a later phase.
- Field types below are logical (string, number, enum, datetime, json), not vendor
  types.
- All entities are platform-agnostic; platform-specific fields live in `raw` payloads.

## Phase 2 implemented in-memory types (2026-06-11)

Phase 2 implemented several of these entities as TypeScript types, in memory only.
Physical persistence (database, tables, indexes) is still deferred to a later phase;
every Phase 2 value is derived per refresh and discarded — nothing is stored.

| Entity (spec) | Implemented type | Location |
|---|---|---|
| Contract understanding (part of the AIBrief concept) | `ContractUnderstanding` | `lib/understanding/types.ts` |
| AIBrief (evidence portion) | `ResearchBrief` (+ `ResearchSource`, `ResearchStatus`) | `lib/research/types.ts` |
| ProbabilityEstimate | `ProbabilityEstimate` | `lib/probability/types.ts` |
| RiskCheck | `RiskCheckResult` (per check) + `RiskEvaluation` (per evaluation) | `lib/risk/types.ts` |
| Decision dossier (composition, new in Phase 2) | `MarketDossier` (+ `EvaluationSummary`) | `lib/dossier/types.ts` |

Implementation notes: the in-memory types are deterministic-pipeline shapes, not
storage rows — timestamps are caller-supplied, fair-probability fields stay null
without sourced research, and `RiskEvaluation.verdict` can only express
`SKIP | WATCH | PAPER_TRADE` (the locked `REAL_TRADE_ELIGIBLE_LATER` is not
representable at runtime). `PaperTrade`, `Outcome`, `CalibrationBin`, wallet
entities, and all signal entities remain documentation-only.

## Phase 3 persisted research-store schema (2026-06-11)

Phase 3 introduced the first physical schema: a local SQLite database (file
`.kalshi-os/kalshi-os.sqlite`, gitignored) owned exclusively by
`lib/research-store/`. DDL lives in `lib/research-store/schema.ts`; versioned
migrations in `migrations.ts`. Five tables exist:

| Table | Purpose | Key columns |
|---|---|---|
| `schema_migrations` | Append-only migration ledger | `version` (INTEGER PK), `applied_at` |
| `market_sources` | Human-curated evidence sources per market | `id`, `market_ticker`, `market_id`, `kind` (`official_resolution_source\|supporting_source\|news\|forecast\|data\|other`), `title`, `url`, `publisher`, `excerpt`, `notes`, `credibility` (`official\|high\|medium\|low\|unknown`), `status` (`draft\|accepted\|rejected`), `added_by` (`human\|fixture\|ai_draft`), timestamps |
| `research_briefs` | Manually entered research briefs (human-typed; never labeled AI research) | `id`, `market_ticker`, `state` (`not_run\|insufficient_sources\|draft\|human_reviewed`), `summary`, `yes_case`, `no_case`, `key_evidence`, `uncertainties`, `missing_info`, `confidence` (`low\|medium\|high`), `source_count` (server-computed), `basis` (`manual\|assembled_from_sources\|ai_draft_unreviewed\|fixture`), timestamps |
| `probability_estimates` | Human-entered fair-probability ranges | `id`, `market_ticker`, `low`/`mid`/`high` (REAL fractions), `rationale` (required), `basis` (`human_entered\|human_reviewed\|ai_suggested_unreviewed\|fixture`), `confidence`, `source_count`, `brief_id`, timestamps |
| `theses` | Written theses | `id`, `market_ticker`, `status` (`draft\|ready_for_risk\|archived`), `thesis` (required non-empty), `why_mispriced`, `invalidation_criteria`, `probability_estimate_id`, `source_ids_json`, timestamps |

Conventions (binding; stated once in `lib/research-store/types.ts`):

- **Units:** the database and API store probabilities as fractions in [0, 1] with
  `low <= mid <= high` (enforced by CHECK constraints). UI forms take percent and
  convert client-side. Expected edge displays in cents (`edge × 100`), matching
  the risk engine's reason strings, and is YES-side signed.
- **Ids and timestamps:** TEXT UUID primary keys; ISO-8601 TEXT timestamps that
  are always injected by callers (`nowIso`) — the store never reads a clock, and
  the database never generates a time.
- **Server-authoritative counts:** `source_count` is computed from currently
  accepted sources at write time and never trusted from the client.
- **Latest-active selection:** the active brief/estimate is the latest row by
  `created_at DESC, rowid DESC`; the active thesis is the latest non-`archived`
  row by the same ordering. Saving a brief or estimate always inserts a new row.
- **Audit trail — no deletes:** there are no DELETE routes and no delete
  functions. Sources are `rejected`, theses are `archived`; superseded briefs and
  estimates simply stop being latest. Every row that ever existed remains
  queryable for audit.
- Enum value sets are double-enforced: `validation.ts` is the primary validator
  (HTTP 400 path); the CHECK constraints above are database-level defense only.

## Phase 4 schema additions (2026-06-12)

Migration v2 adds two tables (seven total), same database, same conventions
(TEXT UUID ids, caller-injected ISO timestamps, fractions in [0, 1], no deletes,
ticker indexes):

| Table | Purpose | Key columns |
|---|---|---|
| `market_settlement_sources` | Human-verified settlement-source records — verification of the resolution authority, deliberately separate from research evidence | `id`, `market_ticker`, `market_id`, `title` (required), `url`, `publisher`, `authority_type` (`kalshi_rules\|official_government_source\|official_organization_source\|exchange_resolution_source\|other`; nullable for drafts), `status` (`draft\|human_verified\|rejected`), `notes`, `verification_rationale`, timestamps |
| `paper_decision_entries` | Paper-only simulated decision snapshots | `id`, `market_ticker`, `market_id`, `market_title`, `platform`, `side` (CHECK: `YES` only), `paper_price` / `implied_probability` / `fair_low` / `fair_mid` / `fair_high` (REAL fractions in [0, 1], `fair_low <= fair_mid <= fair_high`), `expected_edge` (fraction in [-1, 1]), `confidence` (`low\|medium\|high`), `thesis_id` + `thesis_snapshot` (required), `probability_estimate_id`, `research_source_ids_json`, `research_sources_snapshot_json`, `settlement_source_id` + `settlement_source_snapshot_json` (required), `risk_verdict` (CHECK: `PAPER_TRADE` only), `risk_checklist_json` (required), `risk_reasons_json`, `market_snapshot_json`, `status` (`logged\|archived`), timestamps |

Phase 4 conventions (binding):

- **Active verified settlement source:** the latest row whose *current* status
  is `human_verified`, selected by `created_at DESC, rowid DESC` (with
  `authority_type IS NOT NULL` as a defensive guard). Draft and rejected rows
  never count; a previously verified row that is later rejected stops counting
  immediately, and the selection falls back to the next-latest verified row, if
  any. Statuses are mutable via PATCH; rows are never deleted.
- **Verification field requirements:** a record may be `draft` with only a
  title, but `human_verified` (at creation or via PATCH transition) requires a
  non-empty `title`, `url`, a valid `authority_type`, and a written
  `verification_rationale` — enforced by `validation.ts` and re-checked at the
  store layer.
- **Paper entries are snapshots, not trades:** there are deliberately NO
  stake, contract-count, exit, outcome, PnL, or lifecycle columns (asserted by
  a column-audit test). `paper_price` is the YES ask at log time as a fraction;
  the entry is created only through the server-validated `PAPER_TRADE` path,
  and the `risk_verdict` CHECK makes that the only storable verdict. The only
  post-creation mutation is `logged` → `archived`; archived rows persist as an
  audit trail.
- **Units restated:** every probability-like column is a fraction in [0, 1];
  cents appear only at display time (`value × 100`).

The `PaperTrade` planning entity below (stake, contracts, exit price, outcome,
paper PnL) remains documentation-only: `paper_decision_entries` is deliberately
narrower, and the additional fields stay deferred to a future explicitly
approved phase.

## Platform

| Field | Type | Purpose |
|---|---|---|
| id | string enum | 'kalshi' \| 'polymarket' |
| name | string | Display name |
| capabilities | json | Connector capability flags (e.g. hasWalletVisibility, hasOrderbook) |
| status | enum | active \| planned \| disabled |

## Market

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| platformId | string | FK -> Platform |
| externalId | string | Platform-native market/ticker id |
| title | string | Market question |
| category | string | weather, economics, politics, sports, crypto, etc. |
| rulesText | string | Exact contract rules |
| resolutionCriteria | string | How the market resolves |
| settlementSource | string | Who/what determines resolution |
| expiry | datetime | Expiration/resolution time |
| status | enum | active \| closed \| settled |
| ambiguityFlag | boolean | Set when wording/resolution is ambiguous (forces SKIP) |

## MarketSnapshot

Point-in-time price state. Append-only.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| capturedAt | datetime | Snapshot time |
| yesPrice / noPrice | number | Last/mid prices (0–1) |
| bid / ask | number | Best bid/ask |
| spread | number | ask − bid |
| volume | number | Traded volume |
| openInterest | number \| null | Where the platform exposes it |
| liquidityScore | number \| null | Derived liquidity measure |
| raw | json | Platform-native payload for audit |

## WatchlistItem

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| reason | string | Why it is being watched |
| sourceSignalId | string \| null | FK -> StrategySignal / WalletSignal / GraphSignal |
| createdAt | datetime | When added |
| status | enum | watching \| promoted \| dropped |

## PaperTrade

Every idea is logged before real money. Fields per the master brief:

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| platform | string | FK -> Platform |
| market | string | FK -> Market |
| side | enum | YES \| NO |
| entryPrice | number | Price at paper entry (0–1) |
| paperStake | number | Paper dollars committed |
| contracts | number | Paper contract count |
| thesis | string | Written thesis — required; no trade without it |
| fairProbability | number | System's fair-probability estimate at entry |
| confidence | enum | low \| medium \| high |
| plannedExit | string | Exit plan (price/time/condition) |
| reasonForTrade | string | Why this trade over SKIP |
| riskChecklist | json | RiskCheck results snapshot at entry |
| timestamp | datetime | Entry time |
| exitPrice | number \| null | Price at paper exit |
| outcome | string \| null | FK -> Outcome once settled |
| paperPnL | number \| null | Realized paper profit/loss |

## RiskCheck

One deterministic risk-engine evaluation. Append-only audit record.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| signalId | string \| null | FK -> StrategySignal that triggered evaluation |
| evaluatedAt | datetime | When evaluated |
| checks | json | Per-rule pass/fail: resolution clarity, settlement source, spread, liquidity, edge threshold, confidence, written thesis, stake/exposure limits, cooldown/loss limits, platform restrictions |
| verdict | enum | SKIP \| WATCH \| PAPER_TRADE \| REAL_TRADE_ELIGIBLE_LATER (locked; never issued in V1) |
| failReasons | string[] | Human-readable reasons for SKIP |

## ProbabilityEstimate

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| createdAt | datetime | Estimate time |
| marketImpliedProb | number | From current prices |
| fairProbLow / fairProbMid / fairProbHigh | number | Estimated fair range |
| expectedEdge | number | fairProbMid − marketImpliedProb (pre spread/fees) |
| confidence | enum | low \| medium \| high |
| uncertaintyNotes | string | Reasons the estimate could be wrong |
| sourceIds | string[] | Evidence sources used (no source = low confidence) |

## AIBrief

Advisory only. Never approves or executes anything.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| createdAt | datetime | Generation time |
| contractExplanation | string | What the contract asks, how it resolves |
| evidenceSummary | string | What the sources say |
| risks | string | What could go wrong |
| probabilityRange | string | Reasonable range per the brief |
| citations | json | Source URLs/references; missing citations cap confidence at low |
| model | string | Which model produced it (audit) |

## StrategySignal

Strategies emit signals only; the risk engine decides.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| platformId | string | FK -> Platform |
| strategyName | string | e.g. weather-model, stale-market, econ-release |
| createdAt | datetime | Emission time |
| fairProbability | number \| json | Point or range |
| expectedEdge | number | Estimated edge |
| confidence | enum | low \| medium \| high |
| evidence | json | Supporting data/citations |
| reasonsToSkip | string[] | Strategy's own caveats |

## Wallet (Polymarket-oriented; future phase)

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| platformId | string | FK -> Platform (wallet visibility is Polymarket-only) |
| address | string | Wallet address or trader profile id |
| nickname | string \| null | If available |
| categoriesTraded | string[] | Where the wallet is active |
| firstSeenAt / lastSeenAt | datetime | Activity window |

## WalletSnapshot

Periodic performance capture per wallet. Append-only.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| walletId | string | FK -> Wallet |
| capturedAt | datetime | Snapshot time |
| realizedPnL | number | Historical realized PnL |
| roi | number | Return on investment |
| winRate | number | Win rate |
| avgTradeSize | number | Average trade size |
| categoryStrengths | json | Per-category performance |
| consistencyScore | number | Many repeatable wins vs one lucky trade |
| recentPerformance | json | Recency-weighted results |
| maxDrawdown | number | Risk taken |

## WalletSignal

Signal, not a trade. Never auto-copied.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| walletId | string | FK -> Wallet |
| marketId | string | FK -> Market |
| createdAt | datetime | Detection time |
| action | enum | new_position \| increase \| reduce \| exit \| large_trade \| cluster |
| side | enum | YES \| NO |
| walletEntryPrice | number | Wallet's entry price |
| currentPrice | number | Price at detection |
| copyEdgeRemaining | boolean | Whether copy edge appears gone (e.g. entered 42c, ask now 55c) |
| notes | string | e.g. "wallet strong in geopolitics, weak in sports"; "wallet exiting, do not chase" |

## GraphSignal

Related-market / cross-platform consistency signal. Signal-only, future phase.

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketIds | string[] | Markets in the relationship |
| createdAt | datetime | Detection time |
| relationshipType | string | related-market, cross-platform, mutually-exclusive set, etc. |
| impliedInconsistency | number | Magnitude of the pricing inconsistency |
| confidence | enum | low \| medium \| high |
| evidence | json | Prices/relations supporting the signal |

## Outcome

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| marketId | string | FK -> Market |
| resolvedAt | datetime | Settlement time |
| result | enum | YES \| NO \| void/ambiguous |
| settlementSourceUsed | string | What actually determined resolution |
| notes | string | Settlement surprises, disputes |

## CalibrationBin

Aggregated predicted-vs-actual for calibration tracking (Brier score later).

| Field | Type | Purpose |
|---|---|---|
| id | string | Internal id |
| binRange | string | e.g. "0.60–0.70" predicted probability |
| scope | json | Filter: overall, per category, per strategy, per wallet-signal |
| predictionCount | number | Predictions in bin |
| actualRate | number | Observed frequency of YES |
| avgPredicted | number | Mean predicted probability in bin |
| paperPnL | number | Aggregate paper PnL for bin scope |
| updatedAt | datetime | Last recompute |

## Relationships (summary)

- Platform 1—N Market 1—N MarketSnapshot.
- Market 1—N WatchlistItem, ProbabilityEstimate, AIBrief, StrategySignal, RiskCheck,
  PaperTrade; Market 1—1 Outcome.
- StrategySignal —> RiskCheck —> (verdict PAPER_TRADE) —> PaperTrade —> Outcome —>
  CalibrationBin updates.
- Wallet 1—N WalletSnapshot, WalletSignal; WalletSignal references Market and feeds
  the same RiskCheck path as any other signal.
- GraphSignal references multiple Markets and also feeds RiskCheck.
- CalibrationBin aggregates ProbabilityEstimate + Outcome pairs (and PaperTrade PnL)
  per scope.

Physical schema for the entities above remains deferred except where the Phase 3
and Phase 4 research-store sections document otherwise (sources, briefs,
probability estimates, theses, settlement-source records, paper decision
entries). Do not create further schema files from this document without
explicit approval.
