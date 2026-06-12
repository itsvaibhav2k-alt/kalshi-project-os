# ROADMAP

Source of truth: `/Users/vaibhav/Documents/Obsidian Vault/Kalshi Project OS - Phase 0 Master Brief.md`
Dated 2026-06-11.

Global rules:

- Every phase transition requires explicit human approval. No agent advances phases on its own.
- Real-money execution is locked until Phase 13 and requires explicit human approval plus
  documented paper-trading evidence (Phase 12 gate). No execution code exists before Phase 13.
- V1 (Phases 1–8) is Training Wheels Mode: paper-only, no trading API keys, no live orders,
  no market orders, default SKIP.
- Core principle in every phase: LLM recommends. Rules permit. Human approves. Execution obeys.
- Record significant decisions in `docs/DECISION_LOG.md` as they happen.

---

## Phase 0 — Project constitution

Scope: Docs, rules, and Claude commands only. CLAUDE.md, docs/*, .claude/rules/*,
.claude/commands/*. Defines mission, safety model, architecture direction, data model,
risk engine spec, wallet-intelligence plan, agent operating model.

Definition of done: All required constitution files exist; a fresh Claude Code session can
start Phase 1 without re-asking what the project is; no app code, dependencies, schemas,
or secrets exist.

Not in this phase: Any app code, UI, ingestion, schemas, dependency installation,
API keys, Phase 1 scaffolding.

## Phase 1 — Read-only Kalshi ingestion + scanner

Scope: Phase 1 is read-only Kalshi market ingestion and scanner only. It must not include paper trading, wallet intelligence, execution, auth, trading credentials, or AI recommendations. Pull active Kalshi markets via public market-data API; normalize into the
platform-agnostic Market/MarketSnapshot shapes; scanner view listing title, category,
platform, YES/NO price, bid/ask, spread, volume, open interest, expiry, status, liquidity,
watchlist flag; basic junk filtering.

Definition of done: Kalshi markets ingest and refresh reliably; scanner lists and filters
them; data passes through the MarketConnector interface (KalshiConnector only); tests cover
normalization and filtering; zero write/trade endpoints touched.

Not in this phase: Paper trading, wallet intelligence, execution, auth, trading
credentials, AI recommendations, Polymarket, probability estimates, risk verdicts.

## Phase 2 — Market detail + contract understanding

Scope: Market detail page per market: exact rules, resolution criteria, settlement source,
orderbook/price, spread/liquidity, recent price movement, related markets. Contract
understanding: parse and explain what the contract asks, how it resolves, resolution
source, edge cases, ambiguity flag. Ambiguous contract → flagged SKIP-quality.

Definition of done: Any scanned market can be opened and understood without leaving the
system; ambiguity detection works and is tested; settlement source surfaced for every market.

Not in this phase: Probability estimates, AI trade recommendations, paper trading,
risk verdicts, research retrieval, execution of any kind.

## Phase 3 — Research engine (source-grounded)

Scope: Per-market evidence gathering by category (weather: NOAA/NWS, observations,
forecasts, historical distributions; economics: BLS, FRED, Fed calendar, consensus, prior
surprises; geopolitics/news: official statements, credible reporting, timelines). AI
summarizes with citations. No source = low confidence, stated explicitly.

Definition of done: Research briefs cite sources; uncited claims are marked low-confidence;
category source lists documented; retrieval tested against fixture data.

Not in this phase: Probability/edge math, trade recommendations, risk verdicts, paper
trading, wallet data, execution.

Status (2026-06-11): **Phase 3 as built is complete, pending explicit human approval
to advance.** The human-approved Phase 3 Master Brief redefined this phase's scope
to the manual research-to-thesis loop with local SQLite persistence: human-curated
sources → manual research brief → human-entered fair-probability range → written
thesis → unchanged deterministic risk verdict. Automated per-category evidence
retrieval and AI-written briefs remain future work (the original scope above plus
Phase 4's AI-brief portion). Persisted sources never auto-verify the settlement
source, so live markets may remain SKIP with full research — correct behavior. No
paper journal, PnL, calibration, or execution code was added. See
`docs/ARCHITECTURE.md` (Phase 3 as built) and `docs/DECISION_LOG.md`.

## Phase 4 — Probability engine + AI briefs

Scope: Estimate market-implied probability; fair probability low/mid/high; confidence;
expected edge; uncertainty; reasons the estimate could be wrong. AI briefs combine contract
understanding + research + probability into a structured advisory document. Advisory only.

Definition of done: Every estimate carries a range, confidence, and failure reasons; briefs
are reproducible from logged inputs; no brief contains a buy/sell instruction — only inputs
for the risk engine.

Not in this phase: Risk verdicts, paper trading, position sizing, execution, wallet
signals, profitability claims.

Status (2026-06-12): **Phase 4 as built is complete, pending explicit human
approval to advance.** The human-approved Phase 4 Master Brief redefined this
phase's scope to (1) human-verified settlement-source records and (2) the paper
decision journal — the probability-engine portion of the original scope above
already shipped in Phases 2–3, and AI briefs remain deferred (see the Phase 3
status note and `docs/DECISION_LOG.md`). As built: a dedicated settlement
record (`draft`/`human_verified`/`rejected`, no deletes) satisfies the
`settlement_source` risk check via a pure dossier overlay with `lib/risk`
byte-unchanged; paper decision entries are simulated decision snapshots created
only from server-validated `PAPER_TRADE` dossiers, under the new
`/api/paper-journal/**` namespace (the second and last V1 mutation namespace).
This lands the journaling half of Phase 6's scope early, in a deliberately
narrower form. Explicitly deferred: paper PnL, NO-side entries, settlement
outcome tracking/learning, calibration, and all execution code. See
`docs/ARCHITECTURE.md` (Phase 4 as built), `docs/RISK_ENGINE.md` (Phase 4
status), and `docs/SAFETY.md` (section h).

## Phase 5 — Deterministic risk engine

Scope: Hard-coded rule evaluation: resolution clarity, settlement source clarity, spread,
liquidity, edge threshold, confidence, written thesis present, stake/exposure limits,
cooldown/loss limits, platform restrictions. Verdicts: SKIP, WATCH, PAPER_TRADE.
REAL_TRADE_ELIGIBLE_LATER exists as a locked enum value only. Default verdict is SKIP.

Definition of done: Risk engine is fully deterministic (same inputs → same verdict); LLM
output and any signal can never bypass it; every rule has unit tests including the default-
SKIP path; verdicts logged with reasons.

Not in this phase: Real-trade verdicts, execution code, order sizing for real money,
auto-trading, loosened thresholds.

## Phase 6 — Paper trading journal

Scope: Log every idea before any risk: platform, market, side, entry price, paper stake,
contracts, thesis, fair probability, confidence, planned exit, reason, risk checklist,
timestamp, exit price, outcome, paper PnL. No paper trade without a written thesis and a
passing risk verdict.

Definition of done: Paper trades persist with full audit trail; trades without thesis are
rejected; settlement updates outcome and paper PnL; journal is queryable for calibration.

Not in this phase: Real money in any form, trading credentials, auto-entry of trades,
PnL hype displays.

## Phase 7 — Calibration + evals

Scope: Predicted probability vs. actual outcome; paper PnL; win rate; average vs. realized
edge; per-category and per-strategy performance; calibration bins; Brier score later.
Eval harness so AI components are scored, not trusted.

Definition of done: Calibration dashboard answers "when the system says 70%, does it happen
~70% of the time?"; scorecards exist per category; results computed from journal data only.

Not in this phase: Real-money decisions based on calibration, strategy auto-tuning that
weakens risk rules, execution.

## Phase 8 — First strategy modules

Scope: Separate strategy modules that emit signals only (market, platform, strategy name,
fair probability/range, expected edge, confidence, evidence, reasons to skip). Initial
candidates: broad scanner, weather model, stale-market detector, econ-release strategy.
All signals route through the risk engine.

Definition of done: At least one strategy emits well-formed signals end-to-end into risk →
paper journal → calibration; strategy scorecards live; no strategy can place any trade.

Not in this phase: Sports module, wallet strategies, real execution, signal-to-trade
shortcuts that bypass risk.

## Phase 9 — Polymarket read-only connector + wallet intelligence (signal-only)

Scope: PolymarketConnector (read-only): markets, prices, volumes, public wallet/trader
activity. Wallet intelligence module: wallet identity, performance (realized PnL, ROI, win
rate, category strengths, consistency, drawdowns, luck-vs-skill), behavior (entries,
increases, exits, clustering), trade context (wallet entry price vs. current price, copy
edge remaining, liquidity, spread, expiry, ambiguity). Output is signals only, e.g.
"Wallet X entered YES at 42¢; current ask 55¢, copy edge may be gone."

Definition of done: Polymarket data flows through the same MarketConnector interface;
wallet signals feed the risk engine like any strategy; paper-copy only; U.S. eligibility,
KYC, and regulatory status documented as verified-or-open questions before anything beyond
read-only.

Not in this phase: Copy-trading, auto-following wallets, Polymarket trading credentials,
real execution, treating wallet signals as guaranteed edge.

## Phase 10 — Relationship graph + cross-platform consistency (signal-only)

Scope: Related-market and cross-platform consistency checks: same/related events priced
inconsistently within Kalshi, within Polymarket, or across platforms. Graph signals with
evidence and reasons-to-skip. Signal-only; routed through the risk engine.

Definition of done: Graph signals are generated, scored, and paper-traded like other
strategies; graph signal scorecard exists; no arbitrage execution exists.

Not in this phase: Real arbitrage execution, simultaneous order placement, any live orders.

## Phase 11 — Backtesting/simulation + telemetry

Scope: Historical replay and simulation of strategies with explicit caveats (lookahead
bias, survivorship bias, overfitting, data quality, liquidity and execution assumptions).
Telemetry: pipeline-stage visibility, latency, data freshness, audit views. Anti-dopamine
UX: audit logs over green-number hype.

Definition of done: Strategies can be backtested with documented assumptions; simulation
results carry caveat labels; telemetry shows pipeline health; nothing in telemetry implies
verified profitability.

Not in this phase: Using backtests alone to justify real money, execution code,
performance claims without live paper evidence.

## Phase 12 — Real-money readiness review (evidence gate)

Scope: Evidence review only. Compile paper-trading record, calibration results, strategy
scorecards, wallet/graph signal scorecards, drawdown analysis. Define real-money guardrails
per the brief: small learning sub-account (e.g. $20 of $100, $80 reserve), $1–$2 max per
trade, max $5 total exposure, stop at defined drawdown, stop after 2 daily losses, no
all-ins, no revenge trading, no trade without thesis, default SKIP. Verify Polymarket U.S.
eligibility if in scope. Written go/no-go decision by the human.

Definition of done: A written readiness report with documented paper-trading evidence
exists; human has explicitly approved or rejected proceeding; guardrail values fixed in
docs. Still no execution code.

Not in this phase: Any execution code, trading API keys, live orders, sizing logic wired
to real accounts.

## Phase 13 — Production trading desk (locked execution module)

Scope: Tiny, human-approved real-money testing only, contingent on Phase 12 approval.
Isolated, locked execution module implementing the gated pipeline: Scan → Understand →
Research/Predict → Validate/Risk → Size → Execute → Settle/Learn. Every real order requires
explicit per-trade human approval. Deterministic risk engine and hard limits remain final
authority; LLM output and wallet signals still never approve or execute trades.

Definition of done: Execution module is isolated from research/signal code; every order is
human-approved, limit-style (no market orders), within guardrails, fully audit-logged;
kill switch works; settlement feeds back into calibration.

Not in this phase: Auto-trading, market orders, scaling beyond tiny test size, removing or
loosening any safety rule, unattended execution.
