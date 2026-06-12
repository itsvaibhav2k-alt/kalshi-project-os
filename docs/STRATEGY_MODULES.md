# Strategy Modules

Status: Design-only in Phase 0. No strategy code until the relevant roadmap phase.

## Core rule

Strategies are signal emitters, never trade executors.

No strategy module may place orders, approve trades, or bypass the risk engine.
All signals flow to the deterministic risk engine (docs/RISK_ENGINE.md), which
alone issues verdicts: SKIP, WATCH, or PAPER_TRADE. In V1, never a real trade.

Core principle, verbatim:

> LLM recommends. Rules permit. Human approves. Execution obeys.

## Standard signal schema

Every strategy emits StrategySignal records with these fields:

| Field | Description |
|---|---|
| market | Market identifier |
| platform | Kalshi or Polymarket |
| strategy name | Emitting module |
| fair probability / range | Estimated fair probability (low/mid/high) |
| expected edge | Fair probability vs market-implied, before/after spread and fees |
| confidence | Strategy's confidence in its own estimate |
| evidence | Supporting facts with sources; no source = low confidence |
| reasons to skip | Known weaknesses, ambiguity, liquidity/spread concerns |

WalletSignal and GraphSignal are specializations of this schema (see
docs/DATA_MODEL.md). A signal is an argument, not a decision.

## Planned modules

1. **Broad market scanner.** Pulls active markets, surfaces price, spread, volume,
   open interest, expiry, liquidity. Filters obvious junk. Feeds the watchlist.
2. **Weather model.** Grounded in NOAA/NWS data: station-level observations,
   forecasts, historical temperature distributions, settlement rules.
3. **Smart-wallet tracker.** Polymarket-oriented wallet intelligence. Signal-only,
   never copy-trading. See docs/WALLET_INTELLIGENCE.md.
4. **Stale-market detector.** Flags markets whose prices have not adjusted to new
   information or recent related-market moves.
5. **Related-market arbitrage.** Consistency checks across nested, mutually
   exclusive, and cross-platform markets. Spread/fees/liquidity usually erase
   apparent arbitrage. See docs/RELATIONSHIP_GRAPH.md.
6. **Econ-release strategy.** Grounded in BLS, FRED, and the Fed calendar:
   CPI/jobs reports, consensus expectations, prior surprises.
7. **Sports module.** Much later and cautious. Sportsbook odds, injuries, depth
   charts, line movement. Not an early priority.

## Strategy lifecycle

```text
PROPOSED -> PAPER (emitting signals, scorecard accumulating)
         -> PAUSED (scorecard underperforms)
         -> RETIRED
```

Rules:

- Every strategy gets a scorecard: paper PnL, win rate, average vs realized edge,
  calibration by category. See docs/EVALS_AND_CALIBRATION.md.
- Underperforming strategies get paused, not tweaked live. Changes happen offline,
  then the strategy re-enters paper evaluation with a fresh scorecard window.
- No strategy is declared "working" without paper-trading evidence. No profit
  claims, ever.
- New strategies start in paper mode with the default verdict expectation of SKIP.

## Constraints on every module

- [ ] Emits StrategySignal records only; no order placement code paths exist.
- [ ] Cites sources in evidence; uncited claims force low confidence.
- [ ] Includes "reasons to skip" honestly; an empty skip list is suspect.
- [ ] Cannot read or modify risk engine thresholds.
- [ ] Ambiguous contract wording in the target market = recommend SKIP.
- [ ] Logged so calibration can score it later (predicted probability vs outcome).

## Phase 0 definition of done

- [x] This document exists; strategies defined as signal emitters only.
- [ ] No strategy code written in Phase 0 (deferred to roadmap phases).
- [ ] StrategySignal entity defined in docs/DATA_MODEL.md.
- [ ] Scorecard requirements defined in docs/EVALS_AND_CALIBRATION.md.
