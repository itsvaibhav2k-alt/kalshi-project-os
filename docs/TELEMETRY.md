# Telemetry

Status: Phase 0 constitution doc. Design only. NO telemetry code in Phase 0; implementation is deferred to its roadmap phase (see docs/ROADMAP.md).
Date: 2026-06-11

## Purpose

Define what the future dashboard must show so the system is auditable and honest. Telemetry exists to answer "what did the system do and why," not to make trading feel exciting. Inspiration for telemetry patterns (pipeline visibility, freshness, latency) comes from viral dashboards documented in docs/REFERENCE_SYSTEMS.md — adopted as concepts, with their hype rejected.

## Pipeline-stage visibility

The dashboard must show, per V1 pipeline stage, what passed through and what stopped where:

| Stage | Telemetry shown |
|---|---|
| 01 Scan | Markets scanned, filtered out as junk, added to watchlist |
| 02 Understand | Contracts parsed, flagged ambiguous (auto-SKIP) |
| 03 Research/Predict | Briefs produced, sources cited per brief, estimates with confidence |
| 04 Validate/Risk | Risk checks run, which rule failed, verdict issued |
| 05 Paper/Simulate | Paper trades opened, thesis attached, stake and entry recorded |
| 06 Settle/Learn | Outcomes recorded, paper PnL, calibration updated |

Every item must be traceable end to end: a settled paper trade links back through its risk check, AI brief, and the scan that surfaced it.

## Verdict counts

Display running counts of SKIP / WATCH / PAPER_TRADE verdicts (per day, per category, per strategy). In V1 these are the only verdicts; there is no real-trade count to display. A high SKIP ratio is expected behavior — a serious system mostly says no.

## Calibration metrics

- Predicted probability vs actual outcome, bucketed (calibration bins).
- Paper PnL, win rate, average expected edge vs realized edge.
- Per-category and per-strategy breakdowns.
- Brier score later (see docs/EVALS_AND_CALIBRATION.md).

Calibration views rank above PnL views in navigation and layout.

## Strategy scorecards

Per strategy module: signals emitted, verdict distribution, paper outcomes, realized vs expected edge, recency. Wallet-signal scorecards and graph-signal scorecards follow the same shape when those modules exist. Scorecards measure whether a strategy deserves continued attention; they never authorize trades.

## Audit-log access

- Every displayed number links to the logged records that produced it.
- Risk verdicts show which deterministic rule produced them.
- Paper trades show thesis, risk checklist, timestamps, entry/exit, outcome.
- No number without a source record. If it cannot be traced, it is not displayed.

## Data freshness and latency

- Show last-updated timestamps on every market data panel.
- Show ingestion latency and flag stale data visibly.
- A decision rendered on stale data must be marked as such in its record.

## Anti-dopamine UX principles (binding)

1. Calibration and audit views come before PnL views. PnL without calibration is noise.
2. SKIP count is displayed as a healthy metric, not a failure. The default verdict is SKIP; the UI must not frame skipping as missing out.
3. No confetti, no streaks, no win animations, no urgency mechanics, no countdown pressure, no "hot market" badges.
4. Red/green is used for data clarity (direction, pass/fail), never for excitement. No pulsing green PnL.
5. Every displayed number is traceable to logged records (audit-log rule above).
6. No leaderboard framing of the user's own results; no comparisons designed to provoke larger stakes.
7. Losses, SKIPs, and stale-data warnings get equal visual weight to wins.

## Constraints

- No telemetry code in Phase 0.
- Telemetry is read-only over logged records. It never triggers trades, never feeds execution, and never modifies risk rules.
- Future real-execution telemetry (locked pipeline, see docs/REFERENCE_SYSTEMS.md) is out of scope until a human-approved real-money phase.

## Definition of done (for the future implementation phase, not Phase 0)

- [ ] All six V1 pipeline stages have visible counts and drill-down to records.
- [ ] SKIP/WATCH/PAPER_TRADE counts displayed with SKIP framed as healthy.
- [ ] Calibration view ships before or with any PnL view, never after.
- [ ] Every number on screen resolves to an audit-log record.
- [ ] Freshness/latency indicators present on all live data panels.
