# Backtesting and Simulation

Status: Phase 0 constitution doc. Design only. NO backtesting or simulation code in Phase 0; implementation is deferred to its roadmap phase (see docs/ROADMAP.md).
Date: 2026-06-11

## Purpose

Test strategy signals against historical data and simulated outcome distributions BEFORE risking anything — including before trusting paper-trading conclusions too much. The goal is to build evidence, not confidence theater. A backtest exists to try to kill a strategy idea cheaply; surviving a backtest is the minimum bar, not a green light.

Intended future capabilities (concepts only):

- Replay historical market snapshots against a strategy module's signal logic.
- Simulate outcome distributions for a contract (probability lattice / Monte Carlo style), not single point predictions.
- Tail-risk views: how bad the bad cases are, not just the average case.
- Compare strategy verdicts against realized outcomes per category and per platform.

## Mandatory caveats

Every backtest report MUST address each caveat below explicitly. A result that ignores any of these is invalid.

### 1. Lookahead bias

Using information in the test that would not have been available at decision time, such as final settlement data, revised statistics, or news published after the simulated entry. Event markets make this easy to get wrong because resolution sources publish corrections and revisions. Every input to a simulated decision must be timestamped and proven to predate that decision.

### 2. Survivorship bias

Testing only on markets, wallets, or strategies that still exist or are still visible skews results upward. Delisted markets, wound-down contracts, and wallets that blew up disappear from easy datasets. The same bias applies to our inspiration: viral dashboards are survivors; failed clones are invisible (see docs/REFERENCE_SYSTEMS.md).

### 3. Overfitting

Tuning thresholds, parameters, or category filters until a historical dataset looks profitable produces a model of the past, not an edge. With enough parameter twiddling, any dataset yields a "winning" strategy. Mitigations: hold-out periods, out-of-sample testing, parameter counts kept small, and pre-registered hypotheses logged before the test runs.

### 4. Data quality

Historical event-market data may have gaps, wrong timestamps, missing orderbook depth, or prices recorded at low granularity. Garbage data produces precise-looking garbage results. Every backtest must state its data source, coverage period, known gaps, and snapshot frequency.

### 5. Liquidity assumptions

A backtest that assumes unlimited size at the displayed price is fiction in thin event markets. Many Kalshi/Polymarket markets have shallow books where even small orders move the price. Simulated position sizes must be bounded by recorded orderbook depth, or the result must be labeled as ignoring liquidity.

### 6. Execution assumptions (fills and slippage)

Assuming fills at mid-price, or instant fills at the last trade price, overstates results badly when spreads are wide. In thin event markets the realistic fill is at or worse than the ask (for buys), and partial fills are common. Backtests must model fills at the recorded ask/bid plus fees, and state the slippage model used.

## Rules (binding)

1. A backtest is NEVER sufficient evidence alone for real money. Real-money consideration (a much later phase) requires backtest evidence AND sustained paper-trading evidence AND calibration evidence AND explicit human approval.
2. Results must be reproducible: same data + same parameters + same code version = same result. Non-reproducible results are discarded.
3. Results must be logged: dataset identifier, date range, strategy version, parameters, caveat checklist, and outputs are recorded so any number on a dashboard traces back to a run (see docs/TELEMETRY.md).
4. Pre-register hypotheses: write down what the strategy claims and what would falsify it before running the test. Log this in the run record.
5. Report losses and SKIPs, not just wins. A backtest summary without drawdown and worst-case figures is incomplete.
6. Backtesting and simulation are research tools. They emit evidence for strategy scorecards (docs/EVALS_AND_CALIBRATION.md); they never emit trades and never feed an execution path.
7. No backtesting or simulation code in Phase 0. This document defines purpose, caveats, and rules only; detailed design happens in the roadmap phase that owns it.

## Definition of done (for the future implementation phase, not Phase 0)

- [ ] Backtest runner consumes timestamped historical snapshots only (lookahead-safe by construction).
- [ ] Every run produces a logged, reproducible run record with the six-caveat checklist filled in.
- [ ] Fill model uses recorded bid/ask plus fees; liquidity caps position size.
- [ ] Out-of-sample/hold-out evaluation is built in, not optional.
- [ ] Output feeds strategy scorecards; no output feeds execution.
