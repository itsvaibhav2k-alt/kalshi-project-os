# Relationship Graph

Status: FUTURE module. Design-only in Phase 0. No graph code until its roadmap phase.
Type: SIGNAL-ONLY module. Never auto-trades.

## Definition

The relationship graph models markets whose probabilities must be mutually
consistent. When implied probabilities violate consistency constraints, the module
emits GraphSignal records describing the inconsistency. It never trades on them.

Viral dashboards showed "relationship graph mispricing" panels. Treat those as
unverified inspiration, not proof of profit. We adopt the consistency-check
pattern; we reject the auto-execution behind it.

## Relationship types to detect

1. **Nested outcomes.** If outcome A implies outcome B, then P(A) <= P(B).
   Example: "Candidate wins state" cannot exceed "Candidate is on the ballot."
2. **Mutually exclusive, exhaustive sets.** A set of outcomes that covers all
   possibilities should have implied probabilities summing to approximately 100%
   (after accounting for fees and spread). Large deviations are signals.
3. **Same event, cross-platform.** The same event listed on Kalshi and Polymarket
   should trade at similar implied probabilities. A persistent gap is a signal —
   for research, not execution.

## Output: GraphSignal

A GraphSignal uses the standard signal schema (see docs/STRATEGY_MODULES.md):

- market(s) involved
- platform(s)
- strategy name: `relationship-graph`
- fair probability or consistent range implied by the constraint
- expected edge (after estimated spread/fees)
- confidence
- evidence: the constraint violated, current prices, and sources
- reasons to skip

GraphSignal is an entity in docs/DATA_MODEL.md. Signals flow to the deterministic
risk engine (docs/RISK_ENGINE.md), which alone issues SKIP, WATCH, or PAPER_TRADE.
In V1, never a real trade. GraphSignals must never directly approve or execute
real trades, in any phase.

## Why apparent arbitrage usually is not

State this plainly: spread, fees, and liquidity usually erase apparent arbitrage.

- Each leg crosses a bid/ask spread; multi-leg "arbitrage" pays spread multiple times.
- Platform fees reduce or eliminate small consistency gaps.
- Thin liquidity means quoted prices are not fillable at size.
- Cross-platform gaps may reflect different resolution rules, settlement sources,
  or contract wording — read both contracts before calling it mispricing.
- Slippage between observing and acting can close the gap.

Default expectation: most detected inconsistencies are SKIP after costs. The
module's first job is to measure how often apparent mispricings survive cost
adjustment in paper trading, via scorecards in docs/EVALS_AND_CALIBRATION.md.

## Checks before any GraphSignal is paper-tradeable

- [ ] Both/all contracts read; resolution criteria and settlement sources match
      the assumed relationship. Ambiguous wording = SKIP.
- [ ] Edge computed net of spread and fees on every leg.
- [ ] Liquidity sufficient at the quoted prices.
- [ ] Written thesis describing the constraint and why it is violated.
- [ ] Risk engine verdict obtained. Default SKIP.

## Phase 0 definition of done

- [x] This document exists and defines the module as signal-only and deferred.
- [ ] No relationship-graph code, ingestion, or schema written in Phase 0.
- [ ] GraphSignal entity defined in docs/DATA_MODEL.md.
- [ ] GraphSignal scorecards tracked per docs/EVALS_AND_CALIBRATION.md.
