# Evals and Calibration

Status: Phase 0 constitution document
Date: 2026-06-11

The system must measure whether it is actually good — not whether it sounds good.

Principle: **The system must prove it is calibrated before any real-money discussion.**
This is what prevents the AI from sounding smart while being wrong.

## Calibration: Definition

A predictor is calibrated when its stated probabilities match observed frequencies.

Example: across many similar predictions stated at 70%, about 70% should resolve true.
If the system says 70% and those events only resolve true 50% of the time, the system
is overconfident and its edge estimates cannot be trusted, regardless of how well-argued
each individual brief sounds.

Calibration is measured on paper trades and logged predictions only in V1.

## Tracked Metrics

- Predicted probability vs actual outcome (the core calibration comparison)
- Paper PnL
- Win rate
- Average edge at entry (fair probability minus market-implied probability, after spread)
- Realized edge (what the edge actually turned out to be at settlement)
- Category performance (weather, econ, politics, sports, etc.)
- Strategy performance (per strategy module)
- Wallet-signal performance (did following wallet signals on paper add value?)
- Brier score — later addition. One-line definition: the mean squared error between
  predicted probability and the binary outcome (lower is better).

## CalibrationBin

Predictions are grouped into probability buckets for comparison
(entity defined in `docs/DATA_MODEL.md`):

```text
CalibrationBin
  bin_range        e.g., 60-70%
  prediction_count number of resolved predictions in bin
  predicted_avg    average stated probability in bin
  actual_rate      fraction that resolved true
  gap              predicted_avg - actual_rate
```

A bin with few predictions proves nothing. Gaps only matter once a bin has enough
resolved predictions to be meaningful; until then the verdict is "insufficient data,"
not "calibrated."

## Scorecards

Every signal source gets a scorecard. Scorecards are evidence, not marketing.

### Strategy Scorecard (per strategy module)

Fields: strategy name, signals emitted, paper trades taken, win rate, paper PnL,
average edge at entry, realized edge, calibration gap by bin, category breakdown,
sample size, active/paused status.

### Wallet Scorecard (per tracked wallet, Polymarket-oriented, future)

Fields: wallet id/nickname, platform, categories traded, historical realized PnL, ROI,
win rate, consistency, recency, paper-copy performance (entry price vs wallet entry
price, copy edge remaining at our entry), sample size, lucky-vs-skilled assessment,
active/paused status.

### Graph Signal Scorecard (relationship-graph mispricing, future)

Fields: signal type, markets involved, mispricings flagged, how many converged,
paper PnL of flagged opportunities, false-positive rate, sample size,
active/paused status.

## Pausing a Signal Source

A strategy, wallet, or graph signal source is paused (stops generating actionable
signals; may still be observed) when any of:

- Realized performance is persistently negative over a meaningful sample.
- Calibration gap is large and persistent (systematic overconfidence).
- Edge at entry consistently disappears after spread/fees (signals arrive too late).
- Behavior changes (e.g., a wallet's category, size, or style shifts and recent
  performance decays).
- Data quality problems make its inputs untrustworthy.

Pausing is recorded in `docs/DECISION_LOG.md`. Un-pausing requires renewed evidence,
not optimism.

## Hard Rules

1. No claims that a strategy, wallet, or signal "works" without scorecard evidence.
2. Small samples are labeled as small; no extrapolation from a handful of wins.
3. Calibration results gate phase progression: no real-money discussion until paper
   results demonstrate calibration and positive realized edge over a meaningful sample.
4. Metrics are computed deterministically from logged data; the LLM does not grade
   its own performance.
