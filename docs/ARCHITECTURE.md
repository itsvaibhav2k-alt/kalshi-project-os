# ARCHITECTURE.md

Status: Phase 0 planning document, updated with the Phase 1 and Phase 2 as-built records.
Date: 2026-06-11

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
